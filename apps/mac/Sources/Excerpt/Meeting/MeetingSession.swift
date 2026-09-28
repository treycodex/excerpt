import AVFoundation
import Foundation
import OSLog

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
            if image.timeKnown == false { return image }
            var next = image
            next.context = context(at: image.anchorAt ?? image.at, events: events)
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

    enum RecoveryHealth: Equatable {
        case healthy
        case degraded(String)
    }

    enum State: Equatable {
        case idle
        case starting
        case listening(since: Date)
        case finishing(MeetingFinishReason)
        case completed(id: String)
        case interrupted(id: String, message: String)
        case failed(String)

        var isActive: Bool {
            switch self {
            case .listening, .starting, .finishing: true
            case .idle, .completed, .interrupted, .failed: false
            }
        }
    }

    var onStateChange: (() -> Void)?
    /// NotesBridge forwards these snapshots to the editor. Captions never take this
    /// path; only settled, readable meeting state does.
    var onMeetingChange: ((Meeting) -> Void)?
    /// The sole post-save completion route. AppDelegate opens this exact meeting for
    /// both manual stops and capture interruptions, and is never handed an older save.
    var onMeetingFinished: ((Meeting) -> Void)?
    var onHeadphoneSuggestion: (() -> Void)?
    var onHealthChange: (() -> Void)?
    private(set) var state: State = .idle { didSet { onStateChange?() } }
    private(set) var events: [TranscriptEvent] = []
    private(set) var lastSaved: Meeting?
    private(set) var recoveryHealth: RecoveryHealth = .healthy

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
    private let enhancer: MeetingEnhancer
    private let log = Logger(subsystem: "com.excerpt.app", category: "meeting")

    private let capture: any MeetingCapturing
    private let makeTranscribers: () -> [SourceKind: any MeetingTranscribing]

    /// Rebuilt for every meeting, never reused. A `SourceTranscriber` is a one-run
    /// object — see its own note — and holding one across two meetings costs the
    /// second meeting its entire transcript without any visible failure.
    private var transcribers: [SourceKind: any MeetingTranscribing] = [:]

    nonisolated private static func freshTranscribers() -> [SourceKind: any MeetingTranscribing] {
        [.system: SourceTranscriber(kind: .system),
         .microphone: SourceTranscriber(kind: .microphone)]
    }

    private(set) var meetingId = ""
    private(set) var images: [MeetingImage] = []
    private var draftTitle = ""
    private var draftNotes = NotesDocument(
        method: "extractive", keyPoints: [], topics: [], blocks: [])
    private var draftItems: [Item] = []
    private var draftRevision = 0
    private var meetingRevision = 0
    private var documentRevision = 0
    private var sourceRevision = 0
    private var appliedOperationIds: [String] = []
    private var clock = MeetingClock()
    private var pumps: [Task<Void, Never>] = []
    private var edgePumps: [Task<Void, Never>] = []
    private var eventCounter = 0
    private var lifecycleToken: UUID?
    private var finishTask: Task<Void, Never>?
    private var requestedFinishReason: MeetingFinishReason?
    private var captureFailure: String?
    private var pendingSave: Meeting?
    private var headphoneSuggestionIssued = false
    private var journalRecoveryAvailable = true
    private var draftRecoveryAvailable = true

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
         overlay: OverlayController, capture: any MeetingCapturing = CaptureEngine(),
         makeTranscribers: @escaping () -> [SourceKind: any MeetingTranscribing] = { MeetingSession.freshTranscribers() },
         enhancer: MeetingEnhancer? = nil) {
        self.engine = engine
        self.store = store
        self.preferences = preferences
        self.overlay = overlay
        self.enhancer = enhancer ?? MeetingEnhancer(store: store, preferences: preferences, engine: engine)
        self.capture = capture
        self.makeTranscribers = makeTranscribers
    }

    var elapsedMilliseconds: Double { clock.positionMilliseconds() }
    var canCaptureImage: Bool { if case .listening = state { return true }; return false }
    var microphoneHealth: SourceHealth? { health[.microphone] }

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

    func currentMeetingTime(id: String) -> Double? {
        guard id == meetingId, case .listening = state else { return nil }
        return clock.positionMilliseconds()
    }

    /// Returns nil when this mutation belongs to a completed meeting. NotesBridge
    /// then applies it to that meeting's own file, even while another meeting runs.
    @discardableResult
    func applyEditorMutation(_ mutation: MeetingMutation) throws -> MeetingMutationAcknowledgment? {
        guard state.isActive, mutation.meetingId == meetingId else { return nil }
        let current = draftMeeting()
        let acknowledgment = try MeetingMutationReducer.acknowledgment(for: mutation, applyingTo: current)
        guard acknowledgment.status == .applied || acknowledgment.status == .rebased else {
            return acknowledgment
        }

        let next = acknowledgment.meeting
        let nextImages = MeetingMoments.reconcile(next.images ?? images, events: next.events)
        if nextImages != images {
            do { try store.checkpointImages(nextImages, id: meetingId) }
            catch {
                draftRecoveryAvailable = false
                markRecoveryDegraded("image recovery unavailable", error: error)
                throw error
            }
        }
        var durable = next
        durable.images = nextImages
        do { try store.checkpointDraft(durable) }
        catch {
            draftRecoveryAvailable = false
            markRecoveryDegraded("live notes recovery unavailable", error: error)
            throw error
        }
        draftRecoveryAvailable = true
        refreshRecoveryHealth()

        // Commit in-memory capture state only after the recovery checkpoint succeeds.
        draftTitle = durable.title
        draftNotes = durable.notes ?? draftNotes
        draftItems = durable.items
        events = durable.events
        images = nextImages
        meetingRevision = durable.revision ?? meetingRevision
        documentRevision = durable.documentRevision ?? documentRevision
        sourceRevision = durable.sourceRevision ?? sourceRevision
        appliedOperationIds = durable.appliedOperationIds ?? appliedOperationIds
        draftRevision = documentRevision
        onMeetingChange?(durable)
        return MeetingMutationAcknowledgment(
            operationId: acknowledgment.operationId, meetingId: acknowledgment.meetingId,
            status: acknowledgment.status, revision: meetingRevision,
            documentRevision: documentRevision, sourceRevision: sourceRevision,
            meeting: durable, message: acknowledgment.message)
    }

    func cancelBackgroundWork(for id: String) { enhancer.cancel(id: id) }

    @discardableResult
    func addScreenshot(_ capture: MeetingScreenshot.Capture, for id: String) throws -> MeetingImage {
        guard id == meetingId, canCaptureImage else { throw NSError(domain: "Excerpt", code: 1, userInfo: [NSLocalizedDescriptionKey: "The meeting ended before the screenshot could be added."]) }
        let at = clock.positionMilliseconds(at: capture.capturedAt)
        let image = MeetingImage(id: UUID().uuidString, dataUrl: capture.dataURL,
            capturedAt: ISO8601DateFormatter().string(from: capture.capturedAt),
            at: at, caption: "", origin: capture.origin,
            context: MeetingMoments.context(at: at, events: TranscriptAssembly.assemble(events.filter(\.isFinal))))
        let next = images + [image]
        do { try store.checkpointImages(next, id: meetingId) }
        catch {
            draftRecoveryAvailable = false
            markRecoveryDegraded("image recovery unavailable", error: error)
            throw error
        }
        images = next
        insertImageBlock(image)
        draftRevision += 1
        documentRevision += 1
        meetingRevision += 1
        try checkpointDraftAndPublish()
        status = "Screenshot added · \(images.count) in this meeting"
        return image
    }

    // MARK: - Start

    func start() async {
        guard !state.isActive else { return }
        if let failed = pendingSave {
            do { try persistFinished(failed) }
            catch {
                status = "Could not save the previous meeting yet — its recovery copy is still on this Mac"
                return
            }
        }
        let token = UUID()
        lifecycleToken = token
        status = "Getting ready…"
        state = .starting

        meetingId = "m-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.lowercased())"
        lastSaved = nil
        pendingSave = nil
        requestedFinishReason = nil
        captureFailure = nil
        clock = MeetingClock()
        events = []
        images = []
        draftTitle = Self.title(for: clock.startedAt)
        draftNotes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [])
        draftItems = []
        draftRevision = 0
        meetingRevision = 0
        documentRevision = 0
        sourceRevision = 0
        appliedOperationIds = []
        recoveryHealth = .healthy
        audioStats = [:]
        speechStats = [:]
        diagnosis = ""
        eventCounter = 0
        suppressedEchoes = 0
        headphoneSuggestionIssued = false
        journalRecoveryAvailable = true
        draftRecoveryAvailable = true
        youEdge = nil
        remoteEdge = nil
        transcribers = makeTranscribers()
        let startupTranscribers = transcribers

        do {
            for kind in SourceKind.allCases {
                guard let transcriber = startupTranscribers[kind] else { continue }
                try await transcriber.start()
                guard lifecycleToken == token, case .starting = state else { return }
            }
        } catch {
            guard lifecycleToken == token, case .starting = state else { return }
            await cleanUpFailedStart(token: token)
            guard lifecycleToken == token, case .starting = state else { return }
            lifecycleToken = nil
            store.discardJournal(id: meetingId)
            overlay.update(speaker: "", text: "")
            overlay.hide()
            fail("Speech recognition could not start. \(error.localizedDescription)")
            return
        }

        guard lifecycleToken == token, case .starting = state else { return }
        consumeSettledSpeech(token: token)
        consumeLiveEdge(token: token)

        do {
            try await capture.start(
                onBuffer: { [weak self, startupTranscribers] kind, buffer, time in
                    // The capture callback runs on the capture queue. Nothing here
                    // touches shared state except through the actor it belongs to.
                    Task { @MainActor [weak self] in
                        guard let self, self.lifecycleToken == token else { return }
                        self.clock.adopt(firstBufferAt: time)
                        await startupTranscribers[kind]?.feed(buffer, at: time)
                    }
                },
                onStreamError: { [weak self] message in
                    Task { @MainActor in self?.reportCaptureLoss(message, token: token) }
                }
            )
        } catch {
            guard lifecycleToken == token, case .starting = state else { return }
            await cleanUpFailedStart(token: token)
            guard lifecycleToken == token, case .starting = state else { return }
            lifecycleToken = nil
            store.discardJournal(id: meetingId)
            overlay.update(speaker: "", text: "")
            overlay.hide()
            fail("Excerpt could not hear the meeting. \(error.localizedDescription)")
            return
        }

        guard lifecycleToken == token, case .starting = state else {
            // Stop may have arrived while ScreenCaptureKit was suspended. Its first
            // stop can race before the stream exists, so release once more here.
            if lifecycleToken == token {
                await capture.stop()
                for (_, transcriber) in startupTranscribers { await transcriber.stop() }
            }
            return
        }
        status = "Listening"
        state = .listening(since: Date())
        startHealthWatch()
        do { try checkpointDraftAndPublish() }
        catch { log.error("initial draft checkpoint failed: \(error.localizedDescription)") }
    }

    private func cleanUpFailedStart(token: UUID) async {
        guard lifecycleToken == token else { return }
        healthWatch?.cancel()
        healthWatch = nil
        await capture.stop()
        for (_, transcriber) in transcribers { await transcriber.stop() }
        for pump in pumps { pump.cancel() }
        pumps = []
        for pump in edgePumps { pump.cancel() }
        edgePumps = []
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
                guard let self, self.state.isActive else { return }
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
            if health[kind] != state {
                health[kind] = state
                onHealthChange?()
            }
            if let concern = state.concern(for: kind.sourceName) { concerns.append(concern) }
        }

        let concern = concerns.first
        guard concern != shownConcern else { return }
        shownConcern = concern
        refreshListeningStatus()
    }

    private func fail(_ message: String) {
        status = message
        state = .failed(message)
        log.error("\(message)")
    }

    /// An interruption stops capture. It must not look like a clean stop, and it must
    /// not lose the transcript — everything settled so far is already journalled.
    func selectedMicrophoneDisconnected(_ name: String) {
        guard let token = lifecycleToken else { return }
        reportCaptureLoss("The selected microphone, \(name), disconnected. Reconnect it or choose another input in Settings, then start a new meeting.", token: token)
    }

    private func reportCaptureLoss(_ message: String, token: UUID) {
        guard lifecycleToken == token, isPreparingOrListening else { return }
        log.error("capture lost: \(message)")
        captureFailure = message
        requestedFinishReason = .interrupted
        status = "Stopped hearing the meeting — saving your transcript…"
        Task { await stop(reason: .interrupted) }
    }

    // MARK: - Settled speech becomes transcript

    private func consumeSettledSpeech(token: UUID) {
        pumps = transcribers.map { kind, transcriber in
            Task { [weak self] in
                for await segment in transcriber.segments {
                    guard let self else { return }
                    await self.record(segment, from: kind, token: token)
                }
            }
        }
    }

    private func record(_ segment: Segment, from kind: SourceKind, token: UUID) async {
        guard lifecycleToken == token, state.isActive else { return }
        let sourceStart = await transcribers[kind]?.captureOffsetSeconds() ?? 0
        guard lifecycleToken == token, state.isActive else { return }
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
        let assembled = TranscriptAssembly.assemble(events.filter(\.isFinal))
        images = MeetingMoments.reconcile(images, events: assembled)
        suppressedEchoes = events.count - assembled.count
        if shouldSuggestHeadphones, !headphoneSuggestionIssued {
            headphoneSuggestionIssued = true
            onHeadphoneSuggestion?()
        }
        // Journalled the moment it settles, not at Stop. This is the whole of gate 12.
        meetingRevision += 1
        journalRecoveryAvailable = store.append(event, toJournalFor: meetingId)
        if journalRecoveryAvailable { refreshRecoveryHealth() }
        else { markRecoveryDegraded("transcript recovery unavailable") }
        do { try checkpointDraftAndPublish() }
        catch { log.error("draft checkpoint failed after speech: \(error.localizedDescription)") }
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
    private func consumeLiveEdge(token: UUID) {
        edgePumps = transcribers.map { kind, transcriber in
            Task { [weak self] in
                for await edge in transcriber.live {
                    guard let self else { return }
                    self.show(edge, from: kind, token: token)
                }
            }
        }
    }

    private func show(_ edge: SourceTranscriber.LiveEdge, from kind: SourceKind, token: UUID) {
        guard lifecycleToken == token, state.isActive else { return }
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

    func stop() async {
        await stop(reason: .stopped)
    }

    private func stop(reason: MeetingFinishReason) async {
        if reason == .interrupted { requestedFinishReason = .interrupted }
        else if requestedFinishReason == nil { requestedFinishReason = reason }

        if let finishTask {
            await finishTask.value
            return
        }
        guard state.isActive, let token = lifecycleToken else { return }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.finish(token: token)
        }
        finishTask = task
        await task.value
    }

    private func finish(token: UUID) async {
        guard lifecycleToken == token, state.isActive else {
            finishTask = nil
            return
        }
        let initialReason = requestedFinishReason ?? .stopped
        status = initialReason == .interrupted
            ? "The meeting was interrupted — saving your transcript…"
            : "Saving your meeting…"
        state = .finishing(initialReason)

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
        overlay.hide()

        let reason = requestedFinishReason ?? initialReason
        let meeting = buildMeeting(reason: reason, captureError: captureFailure)
        pendingSave = meeting
        lifecycleToken = nil
        do {
            try persistFinished(meeting)
        } catch {
            // The journal is still on disk, so nothing is lost — say that rather than
            // implying the meeting is gone.
            status = "Could not save — but your transcript is still on this Mac"
            state = .failed("Could not save the meeting.")
            log.error("save failed: \(error)")
        }
        finishTask = nil
    }

    /// Retries the exact finished snapshot after a durable write failure. Starting a
    /// later meeting never silently replaces this recovery path; its journal remains
    /// available even if the retry is deferred until the next launch.
    @discardableResult
    func retryFailedSave() throws -> Meeting? {
        guard let meeting = pendingSave else { return nil }
        try persistFinished(meeting)
        return meeting
    }

    var canRetryFailedSave: Bool { pendingSave != nil }

    private func persistFinished(_ meeting: Meeting) throws {
        try store.save(meeting)
        store.discardJournal(id: meeting.id)
        pendingSave = nil
        lastSaved = meeting
        if meeting.finishReason == .interrupted {
            let message = "The meeting was interrupted — your transcript and captures were saved"
            status = message
            state = .interrupted(id: meeting.id, message: message)
        } else {
            status = meeting.events.isEmpty ? "Meeting saved · no transcript captured" : "Transcript saved"
            state = .completed(id: meeting.id)
        }
        onMeetingChange?(meeting)
        onMeetingFinished?(meeting)
    }

    private func startEnhancement(for meeting: Meeting) {
        // Started only after Write notes. Its result is merged with whatever the
        // person wrote while the provider was running.
        enhancer.start(source: meeting) { [weak self] updated in
            guard let self else { return }
            if self.lastSaved?.id == updated.id { self.lastSaved = updated }
            if case .completed(let id) = self.state, id == updated.id {
                self.status = updated.generationStatus?.state == .ready
                    ? "Smart notes ready" : "Transcript saved"
            }
            self.onMeetingChange?(updated)
        }
    }

    /// A queued/running enhancement is durable work, not a reason to hold Quit open.
    /// On the next launch it is restarted from its saved source snapshot.
    func resumePendingEnhancements() {
        for meeting in store.list() where meeting.generationStatus?.state == .queued
            || meeting.generationStatus?.state == .running {
            startEnhancement(for: meeting)
        }
    }

    func retryAutomaticNotes(id: String) throws -> Meeting {
        let source = try store.update(id: id) { meeting in
            guard meeting.events.contains(where: { $0.isFinal && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
                throw NSError(domain: "Excerpt", code: 1, userInfo: [NSLocalizedDescriptionKey: "This meeting has no transcript to turn into notes."])
            }
            guard meeting.endedAt != nil,
                  meeting.generationStatus == nil || meeting.generationStatus?.state == .failed
                    || meeting.generationStatus?.state == .cancelled else {
                throw NSError(domain: "Excerpt", code: 1, userInfo: [NSLocalizedDescriptionKey: "Notes are already being written or are ready to read."])
            }
            if meeting.items.isEmpty,
               let started = ISO8601DateFormatter().date(from: meeting.startedAt) {
                meeting.items = (try? engine.extract(events: meeting.events, reference: started)) ?? []
            }
            meeting.generationStatus = NotesGenerationStatus(
                state: .queued, generationId: UUID().uuidString,
                sourceRevision: meeting.sourceRevision ?? 0,
                inputFingerprint: MeetingEnhancer.inputFingerprint(meeting))
        }
        onMeetingChange?(source)
        startEnhancement(for: source)
        return source
    }

    private func buildMeeting(reason: MeetingFinishReason, captureError: String?) -> Meeting {
        // Raw settled segments are what the journal holds; sentences are what a
        // transcript is. Assembly joins the first and resolves the far side's echo.
        let finals = TranscriptAssembly.assemble(events.filter(\.isFinal))
        suppressedEchoes = events.count - finals.count
        var meeting = Meeting(
            id: meetingId,
            title: draftTitle,
            startedAt: ISO8601DateFormatter().string(from: clock.startedAt),
            endedAt: ISO8601DateFormatter().string(from: Date()),
            processing: .onDevice,
            events: finals,
            items: draftItems,
            notes: draftNotes,
            images: MeetingMoments.reconcile(images, events: finals),
            draftRevision: nil,
            sourceRevision: sourceRevision,
            schemaVersion: Meeting.currentSchemaVersion,
            revision: meetingRevision + 1,
            documentRevision: documentRevision,
            appliedOperationIds: appliedOperationIds,
            finishReason: reason,
            captureError: captureError
        )
        if draftTitle == Self.title(for: clock.startedAt),
           let suggested = try? engine.suggestedTitle(for: meeting), !suggested.isEmpty {
            meeting.title = suggested
        }
        return meeting
    }

    private func draftMeeting() -> Meeting {
        let settled = TranscriptAssembly.assemble(events.filter(\.isFinal))
        return Meeting(
            id: meetingId, title: draftTitle,
            startedAt: ISO8601DateFormatter().string(from: clock.startedAt),
            endedAt: nil, processing: .onDevice,
            events: settled, items: draftItems,
            notes: draftNotes, images: MeetingMoments.reconcile(images, events: settled),
            draftRevision: draftRevision, sourceRevision: sourceRevision,
            schemaVersion: Meeting.currentSchemaVersion,
            revision: meetingRevision,
            documentRevision: documentRevision,
            appliedOperationIds: appliedOperationIds
        )
    }

    private func checkpointDraftAndPublish() throws {
        let draft = draftMeeting()
        do { try store.checkpointDraft(draft) }
        catch {
            draftRecoveryAvailable = false
            markRecoveryDegraded("live notes recovery unavailable", error: error)
            throw error
        }
        draftRecoveryAvailable = true
        refreshRecoveryHealth()
        onMeetingChange?(draft)
    }

    private func insertImageBlock(_ image: MeetingImage) {
        var blocks = draftNotes.blocks ?? []
        guard !blocks.contains(where: { $0.imageId == image.id }) else { return }
        let block = NoteBlock(id: "image-\(image.id)", kind: "image", text: image.caption,
                              evidence: [], at: image.anchorAt ?? image.at,
                              imageId: image.id, placement: "automatic")
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

    private func markRecoveryDegraded(_ message: String, error: Error? = nil) {
        recoveryHealth = .degraded(message)
        refreshListeningStatus()
        if let error { log.error("persistence degraded: \(error.localizedDescription)") }
    }

    private var isPreparingOrListening: Bool {
        switch state {
        case .starting, .listening: true
        default: false
        }
    }

    private func refreshRecoveryHealth() {
        let message: String?
        if !journalRecoveryAvailable && !draftRecoveryAvailable {
            message = "transcript and live notes recovery unavailable"
        } else if !journalRecoveryAvailable {
            message = "transcript recovery unavailable"
        } else if !draftRecoveryAvailable {
            message = "live notes recovery unavailable"
        } else {
            message = nil
        }
        let previous = recoveryHealth
        recoveryHealth = message.map(RecoveryHealth.degraded) ?? .healthy
        if previous != recoveryHealth { refreshListeningStatus() }
    }

    private func refreshListeningStatus() {
        guard isPreparingOrListening else { return }
        let recovery: String? = if case .degraded(let message) = recoveryHealth {
            message
        } else {
            nil
        }
        let messages = [shownConcern, recovery].compactMap { $0 }
        status = messages.isEmpty ? "Listening" : "Listening · " + messages.joined(separator: " · ")
        onStateChange?()
    }

    /// Meeting ids begin `m-<milliseconds since 1970>-`; the UUID suffix prevents two
    /// back-to-back meetings in one millisecond from sharing a file while preserving
    /// the recoverable start time in the journal name.
    private static func startTime(fromMeetingId id: String) -> Date? {
        guard id.hasPrefix("m-"),
              let component = id.dropFirst(2).split(separator: "-").first,
              let millis = Double(component) else { return nil }
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
        let draft: Meeting?
        let sidecarImages: [MeetingImage]
        do {
            draft = try store.recoverDraft(id: id)
            sidecarImages = try store.recoverImages(id: id)
        } catch {
            status = "Could not read the recovered meeting — their recovery files were kept"
            return nil
        }
        let journalEvents = store.replayJournal(id: id)
        let recovered = TranscriptAssembly.assemble(journalEvents.isEmpty ? (draft?.events ?? []) : journalEvents)
        let recoveredImages = sidecarImages.isEmpty ? (draft?.images ?? []) : sidecarImages
        let recoveredWriting = hasWriting(draft?.notes)
        guard !recovered.isEmpty || !recoveredImages.isEmpty || recoveredWriting else {
            store.discardJournal(id: id)
            return nil
        }
        // The id carries the start time, which matters: re-extracting a recovered
        // meeting against today's date would reinterpret every "Thursday" in it.
        let started = Self.startTime(fromMeetingId: id) ?? Date()
        let meeting = Meeting(
            id: id,
            title: "\(draft?.title ?? Self.title(for: started)) (recovered)",
            startedAt: draft?.startedAt ?? ISO8601DateFormatter().string(from: started),
            endedAt: ISO8601DateFormatter().string(from: Date()),
            processing: .onDevice,
            events: recovered,
            items: draft?.items ?? [],
            notes: draft?.notes,
            images: MeetingMoments.reconcile(recoveredImages, events: recovered),
            sourceRevision: draft?.sourceRevision ?? 0,
            schemaVersion: Meeting.currentSchemaVersion,
            revision: (draft?.revision ?? 0) + 1,
            documentRevision: draft?.documentRevision ?? draft?.draftRevision ?? 0,
            appliedOperationIds: draft?.appliedOperationIds,
            finishReason: .recovered
        )
        do {
            try store.save(meeting)
            store.discardJournal(id: id)
            return meeting
        } catch {
            status = "Could not save the recovered meeting — the transcript and screenshots are still recoverable"
            return nil
        }
    }
}
