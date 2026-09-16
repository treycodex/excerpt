import AVFoundation
import Foundation
import OSLog

/// The conflict boundary between the web editor and native capture. Keeping it pure
/// makes the data-loss case testable without starting ScreenCaptureKit.
enum LiveDraftMerge {
    static func editor(current: Meeting, incoming: Meeting) -> Meeting {
        var merged = current
        if !incoming.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            merged.title = incoming.title
        }
        let incomingById = Dictionary(uniqueKeysWithValues: (incoming.images ?? []).map { ($0.id, $0) })
        let known = Set((current.images ?? []).map(\.id))
        let retained = (current.images ?? []).map { image -> MeetingImage in
            guard let edited = incomingById[image.id] else { return image }
            var next = image
            next.caption = edited.caption
            return next
        }
        let additions = (incoming.images ?? []).filter { !known.contains($0.id) }
        merged.images = retained + additions

        if var notes = incoming.notes {
            if (incoming.draftRevision ?? -1) < (current.draftRevision ?? 0) {
                let incomingImages = Set(notes.blocks?.compactMap(\.imageId) ?? [])
                let missing = current.notes?.blocks?.filter {
                    $0.kind == "image" && $0.imageId.map { !incomingImages.contains($0) } == true
                } ?? []
                notes.blocks = (notes.blocks ?? []) + missing
            }
            merged.notes = notes
        }
        merged.draftRevision = (current.draftRevision ?? 0) + 1
        return merged
    }
}

/// Stable transcript anchors for captured moments. Images keep their original time;
/// moving a block in the editor changes presentation order only.
enum MeetingMoments {
    static let before: Double = 20_000
    static let after: Double = 15_000

    static func time(_ event: TranscriptEvent) -> Double {
        event.tStart.map { $0 * 1000 } ?? event.tArrived
    }

    static func end(_ event: TranscriptEvent) -> Double {
        event.tEnd.map { $0 * 1000 } ?? time(event)
    }

    static func context(at: Double, events: [TranscriptEvent]) -> MeetingImageContext {
        let start = max(0, at - before)
        let finish = at + after
        let ids = events.filter { $0.isFinal && end($0) >= start && time($0) <= finish }
            .sorted { time($0) < time($1) }.map(\.id)
        return MeetingImageContext(eventIds: ids, startAt: start, endAt: finish)
    }

    static func reconcile(_ images: [MeetingImage], events: [TranscriptEvent]) -> [MeetingImage] {
        images.map { image in
            var next = image
            next.context = context(at: image.at, events: events)
            return next
        }
    }
}

/// One meeting, from Start to notes on disk.
///
/// This is the product's spine: capture feeds two transcribers, both settle onto one
/// clock, settled speech becomes transcript events that are journalled as they
/// arrive, the live edge drives the overlay, and Stop turns the whole thing into a
/// meeting with items in it.
@MainActor
@Observable
final class MeetingSession {

    enum State: Equatable {
        case idle
        case starting
        case listening(since: Date)
        case saving
        case failed(String)

        var isActive: Bool {
            switch self {
            case .listening, .starting, .saving: true
            case .idle, .failed: false
            }
        }
    }

    var onStateChange: (() -> Void)?
    /// NotesBridge forwards these snapshots to the editor. Captions never take this
    /// path; only settled, readable meeting state does.
    var onMeetingChange: ((Meeting) -> Void)?
    private(set) var state: State = .idle { didSet { onStateChange?() } }
    private(set) var events: [TranscriptEvent] = []
    private(set) var lastSaved: Meeting?

    /// What the user is told while it runs. One line, in their words, not ours.
    private(set) var status = "Not listening"

    /// Measured, not asserted: without headphones the microphone hears the far side
    /// through the speakers, both streams transcribe the same words, and attribution
    /// is corrupted. Suppression handles it, and the count is what makes the advice
    /// honest rather than a generic warning shown to everybody.
    private(set) var suppressedEchoes = 0
    var shouldSuggestHeadphones: Bool { suppressedEchoes >= 3 }

    /// What each source actually did, kept after the meeting ends.
    ///
    /// A meeting with no notes in it has several completely different causes — nothing
    /// was playing, the microphone was muted, the recogniser failed, or nobody said
    /// anything worth noting — and they need completely different things from the user.
    /// "Nothing worth noting was said" is the right answer to exactly one of them, and
    /// saying it for all four is how a broken app looks like a working one.
    private(set) var diagnosis = ""

    private var audioStats: [SourceKind: SourceStats] = [:]
    private var speechStats: [SourceKind: TranscriptStats] = [:]

    /// Live per-source health, and the watch that keeps it current.
    ///
    /// Both stats dictionaries above were only ever filled in `finish()`, to compose
    /// a diagnostic line for a meeting that had already ended. A source that stops
    /// being recognised halfway through is exactly the failure worth interrupting
    /// somebody for, and it was discoverable only afterwards, in the notes.
    private var monitors: [SourceKind: SourceHealthMonitor] = [:]
    private(set) var health: [SourceKind: SourceHealth] = [:]
    private var healthWatch: Task<Void, Never>?
    /// The concern currently being shown, so the status line is not rewritten with
    /// the same words every second.
    private var shownConcern: String?

    private let engine: CoreEngine
    private let store: MeetingStore
    private let preferences: PreferencesStore
    private let overlay: OverlayController
    private let log = Logger(subsystem: "com.excerpt.app", category: "meeting")

    private let capture = CaptureEngine()

    /// Rebuilt for every meeting, never reused. A `SourceTranscriber` is a one-run
    /// object — see its own note — and holding one across two meetings costs the
    /// second meeting its entire transcript without any visible failure.
    private var transcribers: [SourceKind: SourceTranscriber] = MeetingSession.freshTranscribers()

    private static func freshTranscribers() -> [SourceKind: SourceTranscriber] {
        [.system: SourceTranscriber(kind: .system),
         .microphone: SourceTranscriber(kind: .microphone)]
    }

    private(set) var meetingId = ""
    private(set) var images: [MeetingImage] = []
    private var draftTitle = ""
    private var draftNotes = NotesDocument(
        method: "extractive", keyPoints: [], topics: [], blocks: [])
    private var draftRevision = 0
    private var clock = MeetingClock()
    private var pumps: [Task<Void, Never>] = []
    private var edgePumps: [Task<Void, Never>] = []
    private var eventCounter = 0

    /// The latest live edge from each side, on the meeting clock. Kept because a push
    /// carries one source's news and the caption is a decision about both.
    private struct LiveState {
        var start: Double
        var end: Double
        var caption: String
        var provisional: String
    }
    private var youEdge: LiveState?
    private var remoteEdge: LiveState?

    init(engine: CoreEngine, store: MeetingStore, preferences: PreferencesStore,
         overlay: OverlayController) {
        self.engine = engine
        self.store = store
        self.preferences = preferences
        self.overlay = overlay
    }

    var elapsedMilliseconds: Double { clock.positionMilliseconds() }
    var canCaptureImage: Bool { if case .listening = state { return true }; return false }

    /// Settled speech plus one stable, replaceable live row per source. These rows are
    /// display-only: they never enter the journal, saved meeting, or note extraction.
    var catchUpEvents: [TranscriptEvent] {
        var result = TranscriptAssembly.assemble(events.filter(\.isFinal))
        for (role, edge) in [(SourceRole.you, youEdge), (.remote, remoteEdge)] {
            guard let edge, !edge.provisional.isEmpty else { continue }
            result.append(TranscriptEvent(
                id: "\(meetingId)-provisional-\(role.rawValue)", sessionId: meetingId,
                role: role, speakerLabel: role == .you ? "YOU" : "SPEAKER",
                text: edge.provisional, isFinal: false, tArrived: edge.end * 1000,
                confidence: nil, tStart: edge.start, tEnd: edge.end))
        }
        return result.sorted { MeetingMoments.time($0) < MeetingMoments.time($1) }
    }

    /// The editor gets a merged view. It may write the title and document back, but
    /// never owns transcript, images, extracted items, or capture state.
    func activeMeeting(id: String? = nil) -> Meeting? {
        guard state.isActive, !meetingId.isEmpty, id == nil || id == meetingId else { return nil }
        return draftMeeting()
    }

    @discardableResult
    func applyEditorChanges(_ incoming: Meeting) throws -> Meeting {
        if !state.isActive, lastSaved?.id == incoming.id {
            var latest = (try? store.load(id: incoming.id)) ?? lastSaved!
            latest.title = incoming.title
            latest.notes = incoming.notes
            latest.suggestedNotes = incoming.suggestedNotes
            try store.save(latest)
            lastSaved = latest
            onMeetingChange?(latest)
            return latest
        }
        guard state.isActive, incoming.id == meetingId else {
            throw NSError(domain: "Excerpt", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "That meeting is no longer live."])
        }
        // Deliberately accept only fields the editor owns. A stale whole-meeting
        // snapshot therefore cannot erase newer speech or screenshots.
        let merged = LiveDraftMerge.editor(current: draftMeeting(), incoming: incoming)
        let imagesChanged = (merged.images ?? []) != images
        draftTitle = merged.title
        draftNotes = merged.notes ?? draftNotes
        let settled = TranscriptAssembly.assemble(events.filter(\.isFinal))
        images = MeetingMoments.reconcile(merged.images ?? images, events: settled)
        draftRevision = merged.draftRevision ?? draftRevision + 1
        if imagesChanged { try store.checkpointImages(images, id: meetingId) }
        let authoritative = draftMeeting()
        try store.checkpointDraft(authoritative)
        onMeetingChange?(authoritative)
        return authoritative
    }

    func ownsEditorWrites(for id: String) -> Bool {
        (state.isActive && id == meetingId) || lastSaved?.id == id
    }

    @discardableResult
    func addScreenshot(_ capture: MeetingScreenshot.Capture, for id: String) throws -> MeetingImage {
        guard id == meetingId, canCaptureImage else { throw NSError(domain: "Excerpt", code: 1, userInfo: [NSLocalizedDescriptionKey: "The meeting ended before the screenshot could be added."]) }
        let at = clock.positionMilliseconds(at: capture.capturedAt)
        let image = MeetingImage(id: UUID().uuidString, dataUrl: capture.dataURL,
            capturedAt: ISO8601DateFormatter().string(from: capture.capturedAt),
            at: at, caption: "", origin: capture.origin,
            context: MeetingMoments.context(at: at, events: TranscriptAssembly.assemble(events.filter(\.isFinal))))
        let next = images + [image]
        try store.checkpointImages(next, id: meetingId)
        images = next
        insertImageBlock(image)
        draftRevision += 1
        try checkpointDraftAndPublish()
        status = "Screenshot added · \(images.count) in this meeting"
        return image
    }

    // MARK: - Start

    func start() async {
        guard !state.isActive else { return }
        state = .starting
        status = "Getting ready…"

        meetingId = "m-\(Int(Date().timeIntervalSince1970 * 1000))"
        clock = MeetingClock()
        events = []
        images = []
        draftTitle = Self.title(for: clock.startedAt)
        draftNotes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [])
        draftRevision = 0
        eventCounter = 0
        suppressedEchoes = 0
        youEdge = nil
        remoteEdge = nil
        transcribers = Self.freshTranscribers()

        do {
            for (_, transcriber) in transcribers { try await transcriber.start() }
        } catch {
            store.discardJournal(id: meetingId)
            fail("Speech recognition could not start. \(error.localizedDescription)")
            return
        }

        consumeSettledSpeech()
        consumeLiveEdge()

        do {
            try await capture.start(
                onBuffer: { [weak self, transcribers] kind, buffer, time in
                    // The capture callback runs on the capture queue. Nothing here
                    // touches shared state except through the actor it belongs to.
                    Task { @MainActor [weak self] in self?.clock.adopt(firstBufferAt: time) }
                    Task { await transcribers[kind]?.feed(buffer, at: time) }
                },
                onStreamError: { [weak self] message in
                    Task { @MainActor in self?.reportCaptureLoss(message) }
                }
            )
        } catch {
            for (_, transcriber) in transcribers { await transcriber.stop() }
            store.discardJournal(id: meetingId)
            fail("Excerpt could not hear the meeting. \(error.localizedDescription)")
            return
        }

        state = .listening(since: Date())
        status = "Listening"
        startHealthWatch()
        do { try checkpointDraftAndPublish() }
        catch { status = "Listening · live notes recovery unavailable"; log.error("draft checkpoint failed: \(error)") }
    }

    /// How often the counters are folded in. A second is far finer than the
    /// thresholds need and cheap: it reads two in-memory structs.
    private static let healthInterval = Duration.seconds(1)

    /// Watch both sources while the meeting runs, and say so when one stops working.
    ///
    /// Only `stalled` and `failed` reach the status line. A microphone nobody is
    /// speaking into is the normal state of a microphone for most of a meeting, and
    /// reporting that would train people to ignore the line that carries the real
    /// problem. Capture is never torn down over this: one dead source still leaves
    /// the other working, and everything settled so far is already journalled.
    private func startHealthWatch() {
        healthWatch?.cancel()
        monitors = [:]
        health = [:]
        shownConcern = nil
        healthWatch = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: MeetingSession.healthInterval)
                guard let self, await self.state.isActive else { return }
                await self.sampleHealth()
            }
        }
    }

    private func sampleHealth() async {
        let audio = capture.statistics()
        var speech: [SourceKind: TranscriptStats] = [:]
        for (kind, transcriber) in transcribers { speech[kind] = await transcriber.statistics() }

        var concerns: [String] = []
        for kind in SourceKind.allCases {
            var monitor = monitors[kind] ?? SourceHealthMonitor()
            let state = monitor.update(
                audio: audio[kind] ?? SourceStats(), speech: speech[kind] ?? TranscriptStats())
            monitors[kind] = monitor
            health[kind] = state
            if let concern = state.concern(for: kind.sourceName) { concerns.append(concern) }
        }

        let concern = concerns.first
        guard concern != shownConcern else { return }

        if let concern {
            shownConcern = concern
            status = concern
        } else {
            // The fault cleared. Take the line back only if it is still ours — a
            // screenshot or a recovery warning said something the user wanted, and
            // overwriting it with "Listening" would throw that away.
            if status == shownConcern { status = "Listening" }
            shownConcern = nil
        }
        onStateChange?()
    }

    private func fail(_ message: String) {
        state = .failed(message)
        status = message
        log.error("\(message)")
    }

    /// An interruption stops capture. It must not look like a clean stop, and it must
    /// not lose the transcript — everything settled so far is already journalled.
    private func reportCaptureLoss(_ message: String) {
        log.error("capture lost: \(message)")
        status = "Stopped hearing the meeting — your notes so far are saved"
        Task { await finish(reason: .interrupted) }
    }

    // MARK: - Settled speech becomes transcript

    private func consumeSettledSpeech() {
        pumps = transcribers.map { kind, transcriber in
            Task { [weak self] in
                for await segment in transcriber.segments {
                    guard let self else { return }
                    await self.record(segment, from: kind)
                }
            }
        }
    }

    private func record(_ segment: Segment, from kind: SourceKind) async {
        let sourceStart = await transcribers[kind]?.captureOffsetSeconds() ?? 0
        let offset = clock.offsetSeconds(
            forSourceStartingAt: CMTime(seconds: sourceStart, preferredTimescale: 1000))

        let role: SourceRole = kind == .microphone ? .you : .remote

        // Echoes are not judged here. The two sources settle independently and
        // interleave, so the far side's copy of these words may not have arrived yet —
        // measured, and it is why the first real capture labelled the speakers' words
        // YOU. TranscriptAssembly decides it over the finished transcript instead.
        eventCounter += 1
        let event = TranscriptEvent(
            id: "\(meetingId)-e\(eventCounter)",
            sessionId: meetingId,
            role: role,
            speakerLabel: role == .you ? "YOU" : "SPEAKER",
            text: segment.text,
            isFinal: true,
            tArrived: clock.arrivedMilliseconds(),
            confidence: nil,
            tStart: segment.start + offset,
            tEnd: segment.end + offset
        )

        events.append(event)
        images = MeetingMoments.reconcile(images, events: TranscriptAssembly.assemble(events.filter(\.isFinal)))
        // Journalled the moment it settles, not at Stop. This is the whole of gate 12.
        store.append(event, toJournalFor: meetingId)
        do { try checkpointDraftAndPublish() }
        catch { log.error("draft checkpoint failed after speech: \(error)") }
    }

    // MARK: - The live edge drives the overlay

    /// Volatile text is the speaking edge; it is what a caption is for. Finalized text
    /// is the transcript and arrives later by design.
    ///
    /// Pushed, not polled. The tick this replaced added up to 100ms to every caption
    /// and, worse, landed updates on a fixed 10Hz grid uncorrelated with speech, so
    /// words appeared in clumps of whatever the tick caught. The transcriber knows the
    /// instant a result lands, and its stream keeps only the newest edge, so a burst
    /// coalesces into the latest rather than queueing behind live speech.
    private func consumeLiveEdge() {
        edgePumps = transcribers.map { kind, transcriber in
            Task { [weak self] in
                for await edge in transcriber.live {
                    guard let self else { return }
                    await self.show(edge, from: kind)
                }
            }
        }
    }

    private func show(_ edge: SourceTranscriber.LiveEdge, from kind: SourceKind) {
        // On the meeting clock, not this source's own. The two sources start at
        // different instants, so raw local seconds hand whichever began first a
        // permanent lead and the caption sticks to one speaker.
        let placed = clock.meetingRange(
            localStart: 0,
            localEnd: edge.localEnd,
            sourceStartingAt: CMTime(seconds: edge.sourceStart, preferredTimescale: 1000))
        let latest = edge.text.isEmpty && edge.provisionalText.isEmpty ? nil : LiveState(
            start: max(0, placed.end - max(0, edge.localEnd - edge.localStart)),
            end: placed.end, caption: edge.text, provisional: edge.provisionalText)

        if kind == .microphone { youEdge = latest } else { remoteEdge = latest }

        switch CaptionEdge.owner(you: youEdge?.end, remote: remoteEdge?.end) {
        case .you: overlay.update(speaker: "YOU", text: youEdge?.caption ?? "")
        case .remote: overlay.update(speaker: "SPEAKER", text: remoteEdge?.caption ?? "")
        case nil: break
        }
    }

    // MARK: - Stop

    enum FinishReason { case stopped, interrupted }

    func stop() async {
        guard state.isActive else { return }
        await finish(reason: .stopped)
    }

    private func finish(reason: FinishReason) async {
        guard state.isActive else { return }
        if case .saving = state { return }
        state = .saving
        status = "Writing your notes…"

        healthWatch?.cancel()
        healthWatch = nil

        // Read the meters before tearing anything down, or the evidence goes with it.
        audioStats = capture.statistics()
        for (kind, transcriber) in transcribers { speechStats[kind] = await transcriber.statistics() }
        await capture.stop()
        // Stopping the transcribers promotes the tail, which flows through the pumps
        // as ordinary settled speech and lands in the journal like everything else.
        for (_, transcriber) in transcribers { await transcriber.stop() }
        for pump in pumps { _ = await pump.value }
        pumps = []
        // The caption pumps end with their own stream; nothing is owed from them, so
        // they are not waited on — only cleared.
        for pump in edgePumps { pump.cancel() }
        edgePumps = []

        // Re-read: stopping a transcriber promotes its tail, so the counts change.
        for (kind, transcriber) in transcribers { speechStats[kind] = await transcriber.statistics() }
        diagnosis = describeSources()
        log.info("meeting \(self.meetingId) ended — \(self.diagnosis)")

        overlay.update(speaker: "", text: "")

        let meeting = buildMeeting()
        do {
            try store.save(meeting)
            store.discardJournal(id: meetingId)
            lastSaved = meeting
            state = .idle
            status = summary(of: meeting) + " · organizing notes"
            onMeetingChange?(meeting)
            // Saving and opening the meeting must not wait on a model. Its result is
            // merged with whatever is on disk later and offered as a reviewable
            // suggestion when the person already wrote something.
            Task { [weak self] in await self?.enhanceSavedMeeting(id: meeting.id, source: meeting) }
        } catch {
            // The journal is still on disk, so nothing is lost — say that rather than
            // implying the meeting is gone.
            state = .failed("Could not write the notes file.")
            status = "Could not save — but your transcript is still on this Mac"
            log.error("save failed: \(error)")
        }
    }

    private func buildMeeting() -> Meeting {
        // Raw settled segments are what the journal holds; sentences are what a
        // transcript is. Assembly joins the first and resolves the far side's echo.
        let finals = TranscriptAssembly.assemble(events.filter(\.isFinal))
        suppressedEchoes = events.count - finals.count
        // The meeting's own start decides what "Thursday" meant, not today's date.
        let items = (try? engine.extract(events: finals, reference: clock.startedAt)) ?? []
        if items.isEmpty, !finals.isEmpty {
            log.info("no items extracted from \(finals.count) events — silence is the designed answer when nothing qualifies")
        }

        return Meeting(
            id: meetingId,
            title: draftTitle,
            startedAt: ISO8601DateFormatter().string(from: clock.startedAt),
            endedAt: ISO8601DateFormatter().string(from: Date()),
            processing: .onDevice,
            events: finals,
            items: items,
            notes: draftNotes,
            images: MeetingMoments.reconcile(images, events: finals),
            draftRevision: nil,
            sourceRevision: 0
        )
    }

    private func draftMeeting() -> Meeting {
        let settled = TranscriptAssembly.assemble(events.filter(\.isFinal))
        return Meeting(
            id: meetingId, title: draftTitle,
            startedAt: ISO8601DateFormatter().string(from: clock.startedAt),
            endedAt: nil, processing: .onDevice,
            events: settled, items: [],
            notes: draftNotes, images: MeetingMoments.reconcile(images, events: settled),
            draftRevision: draftRevision, sourceRevision: 0
        )
    }

    private func checkpointDraftAndPublish() throws {
        let draft = draftMeeting()
        try store.checkpointDraft(draft)
        onMeetingChange?(draft)
    }

    private func insertImageBlock(_ image: MeetingImage) {
        var blocks = draftNotes.blocks ?? []
        guard !blocks.contains(where: { $0.imageId == image.id }) else { return }
        let block = NoteBlock(id: "image-\(image.id)", kind: "image", text: image.caption,
                              evidence: [], at: image.at, imageId: image.id)
        var insertion = blocks.endIndex
        var nearest = -Double.infinity
        for (index, candidate) in blocks.enumerated() {
            guard candidate.kind != "heading", let at = candidate.at,
                  at <= image.at, at >= nearest else { continue }
            nearest = at
            insertion = index + 1
        }
        blocks.insert(block, at: insertion)
        draftNotes.blocks = blocks
    }

    private func hasWriting(_ document: NotesDocument?) -> Bool {
        (document?.deletedBlocks?.isEmpty == false) || document?.blocks?.contains(where: { block in
            block.kind == "image" || !block.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) == true
    }

    /// Runs after the completed meeting is already durable and visible. It reloads
    /// immediately before saving so edits made while the model worked are retained.
    private func enhanceSavedMeeting(id: String, source: Meeting) async {
        var document: NotesDocument?
        var failureNotice: String?
        do {
            document = try await NotesProviderCoordinator.summarize(
                source, preferences: preferences.load(),
                request: NotesGenerationRequest(style: "balanced"))
        } catch {
            log.error("note enhancement unavailable: \(error.localizedDescription)")
            failureNotice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            document = try? engine.notes(for: source)
        }
        guard var document else {
            if case .idle = state, lastSaved?.id == id { status = summary(of: source) }
            return
        }
        let shape = (try? engine.shapeNotice(for: source)) ?? ""
        let notice = [shape, failureNotice].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        document.notice = notice.isEmpty ? nil : notice
        do {
            var latest = try store.load(id: id)
            if hasWriting(latest.notes) { latest.suggestedNotes = document }
            else { latest.notes = document; latest.suggestedNotes = nil }
            try store.save(latest)
            if lastSaved?.id == id { lastSaved = latest }
            if case .idle = state, lastSaved?.id == id { status = summary(of: latest) }
            onMeetingChange?(latest)
        } catch {
            log.error("summary save failed; saved meeting remains intact: \(error)")
        }
    }

    /// Meeting ids are `m-<milliseconds since 1970>`, so the start time survives even
    /// when nothing but the journal's filename is left.
    private static func startTime(fromMeetingId id: String) -> Date? {
        guard id.hasPrefix("m-"), let millis = Double(id.dropFirst(2)) else { return nil }
        return Date(timeIntervalSince1970: millis / 1000)
    }

    private static func title(for date: Date) -> String {
        let format = Date.FormatStyle(date: .abbreviated, time: .shortened)
        return "Meeting · \(date.formatted(format))"
    }

    /// One line per source, in numbers, for the log and the diagnostics window.
    private func describeSources() -> String {
        SourceKind.allCases.map { kind in
            let audio = audioStats[kind] ?? SourceStats()
            let speech = speechStats[kind] ?? TranscriptStats()
            let error = speech.error ?? audio.lastError
            return String(
                format: "%@: %.1fs voiced, %d buffers, %@, %dv/%df%@",
                kind.rawValue, audio.voicedSeconds, audio.buffers, audio.format,
                speech.volatileResults, speech.finalizedResults,
                error.map { " · \($0)" } ?? "")
        }.joined(separator: " | ")
    }

    /// The end-of-meeting line: what was found, in the user's terms.
    ///
    /// Only one of these endings is "nothing worth noting was said". The others are
    /// failures, and each one names the thing the user can actually go and change.
    private func summary(of meeting: Meeting) -> String {
        guard meeting.items.isEmpty else {
            let decided = meeting.items.filter { $0.state == .decided }.count
            let yours = meeting.items.filter { $0.assignee == .you }.count
            var parts = ["\(meeting.items.count) note\(meeting.items.count == 1 ? "" : "s")"]
            if decided > 0 { parts.append("\(decided) settled") }
            if yours > 0 { parts.append("\(yours) for you") }
            return parts.joined(separator: " · ")
        }

        let system = audioStats[.system] ?? SourceStats()
        let microphone = audioStats[.microphone] ?? SourceStats()
        let heardSomething = system.voicedSeconds + microphone.voicedSeconds > 1

        if let failure = (speechStats[.system]?.error ?? speechStats[.microphone]?.error) {
            return "Speech recognition stopped working — \(failure)"
        }
        if system.buffers == 0 && microphone.buffers == 0 {
            return "No audio reached Excerpt at all — check its permissions"
        }
        if !heardSomething {
            return system.buffers == 0
                ? "Your microphone was heard but the meeting's audio was silent"
                : "Everything was silent — was anything actually playing?"
        }
        if meeting.events.isEmpty {
            return "Heard \(Int(system.voicedSeconds + microphone.voicedSeconds))s of sound but recognised no words"
        }
        return "Nothing worth noting was said"
    }

    // MARK: - Recovery

    /// Meetings whose journal outlived the app. Offered rather than restored silently:
    /// a transcript appearing without being asked for is its own kind of surprise.
    func recoverableMeetings() -> [String] { store.recoverable() }

    @discardableResult
    func recover(id: String) -> Meeting? {
        // The same assembly the live path uses, so a recovered meeting reads like one
        // that ended normally rather than like a pile of fragments.
        let draft = store.recoverDraft(id: id)
        let journalEvents = store.replayJournal(id: id)
        let recovered = TranscriptAssembly.assemble(journalEvents.isEmpty ? (draft?.events ?? []) : journalEvents)
        let sidecarImages = store.recoverImages(id: id)
        let recoveredImages = sidecarImages.isEmpty ? (draft?.images ?? []) : sidecarImages
        let recoveredWriting = hasWriting(draft?.notes)
        guard !recovered.isEmpty || !recoveredImages.isEmpty || recoveredWriting else {
            store.discardJournal(id: id)
            return nil
        }
        // The id carries the start time, which matters: re-extracting a recovered
        // meeting against today's date would reinterpret every "Thursday" in it.
        let started = Self.startTime(fromMeetingId: id) ?? Date()
        let items = (try? engine.extract(events: recovered, reference: started)) ?? []
        var meeting = Meeting(
            id: id,
            title: "\(draft?.title ?? Self.title(for: started)) (recovered)",
            startedAt: draft?.startedAt ?? ISO8601DateFormatter().string(from: started),
            endedAt: nil,
            processing: .onDevice,
            events: recovered,
            items: items,
            notes: draft?.notes,
            images: MeetingMoments.reconcile(recoveredImages, events: recovered)
        )
        // A recovered meeting used to arrive with no notes at all. The summary is not
        // re-run here — recovery is meant to be immediate — but the extractive document
        // costs nothing and is what the notes window expects to open onto.
        if !recoveredWriting { meeting.notes = try? engine.notes(for: meeting) }
        do {
            try store.save(meeting)
            store.discardJournal(id: id)
            return meeting
        } catch {
            status = "Could not save recovered notes — the transcript and screenshots are still recoverable"
            return nil
        }
    }
}
