import AVFoundation
import Foundation
import OSLog

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

    private(set) var state: State = .idle
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

    private let engine: CoreEngine
    private let store: MeetingStore
    private let overlay: OverlayController
    private let log = Logger(subsystem: "com.excerpt.app", category: "meeting")

    private let capture = CaptureEngine()
    private let transcribers: [SourceKind: SourceTranscriber] = [
        .system: SourceTranscriber(kind: .system),
        .microphone: SourceTranscriber(kind: .microphone),
    ]

    private var meetingId = ""
    private var clock = MeetingClock()
    private var pumps: [Task<Void, Never>] = []
    private var captionTicker: Task<Void, Never>?
    private var eventCounter = 0

    init(engine: CoreEngine, store: MeetingStore, overlay: OverlayController) {
        self.engine = engine
        self.store = store
        self.overlay = overlay
    }

    // MARK: - Start

    func start() async {
        guard !state.isActive else { return }
        state = .starting
        status = "Getting ready…"

        meetingId = "m-\(Int(Date().timeIntervalSince1970 * 1000))"
        clock = MeetingClock()
        events = []
        eventCounter = 0
        suppressedEchoes = 0

        do {
            for (_, transcriber) in transcribers { try await transcriber.start() }
        } catch {
            fail("Speech recognition could not start. \(error.localizedDescription)")
            return
        }

        consumeSettledSpeech()

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
            fail("Excerpt could not hear the meeting. \(error.localizedDescription)")
            return
        }

        state = .listening(since: Date())
        status = "Listening"
        startCaptionTicker()
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
        // Journalled the moment it settles, not at Stop. This is the whole of gate 12.
        store.append(event, toJournalFor: meetingId)
    }

    // MARK: - The live edge drives the overlay

    /// Volatile text is the speaking edge; it is what a caption is for. Finalized text
    /// is the transcript and arrives later by design.
    ///
    /// Ten times a second, not twice: a caption that updates every 500ms reads as lag,
    /// and the poll costs two actor hops over a string.
    private func startCaptionTicker() {
        captionTicker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                await self?.refreshCaption()
            }
        }
    }

    private func refreshCaption() async {
        guard overlay.visible else { return }
        let system = await transcribers[.system]?.statistics() ?? TranscriptStats()
        let mic = await transcribers[.microphone]?.statistics() ?? TranscriptStats()

        let systemText = system.lastVolatile.isEmpty ? system.lastFinalized : system.lastVolatile
        let micText = mic.lastVolatile.isEmpty ? mic.lastFinalized : mic.lastVolatile

        // Whoever spoke most recently owns the caption.
        if mic.lastRangeEnd >= system.lastRangeEnd, !micText.isEmpty {
            overlay.update(speaker: "YOU", text: micText)
        } else if !systemText.isEmpty {
            overlay.update(speaker: "SPEAKER", text: systemText)
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
        state = .saving
        status = "Writing your notes…"

        captionTicker?.cancel(); captionTicker = nil
        // Read the meters before tearing anything down, or the evidence goes with it.
        audioStats = capture.statistics()
        for (kind, transcriber) in transcribers { speechStats[kind] = await transcriber.statistics() }
        await capture.stop()
        // Stopping the transcribers promotes the tail, which flows through the pumps
        // as ordinary settled speech and lands in the journal like everything else.
        for (_, transcriber) in transcribers { await transcriber.stop() }
        for pump in pumps { _ = await pump.value }
        pumps = []

        // Re-read: stopping a transcriber promotes its tail, so the counts change.
        for (kind, transcriber) in transcribers { speechStats[kind] = await transcriber.statistics() }
        diagnosis = describeSources()
        log.info("meeting \(self.meetingId) ended — \(self.diagnosis)")

        overlay.update(speaker: "", text: "")

        let meeting = buildMeeting(interrupted: reason == .interrupted)
        do {
            try store.save(meeting)
            store.discardJournal(id: meetingId)
            lastSaved = meeting
            state = .idle
            status = summary(of: meeting)
        } catch {
            // The journal is still on disk, so nothing is lost — say that rather than
            // implying the meeting is gone.
            state = .failed("Could not write the notes file.")
            status = "Could not save — but your transcript is still on this Mac"
            log.error("save failed: \(error)")
        }
    }

    private func buildMeeting(interrupted: Bool) -> Meeting {
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
            title: Self.title(for: clock.startedAt),
            startedAt: ISO8601DateFormatter().string(from: clock.startedAt),
            endedAt: ISO8601DateFormatter().string(from: Date()),
            processing: .onDevice,
            events: finals,
            items: items
        )
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
        let recovered = TranscriptAssembly.assemble(store.replayJournal(id: id))
        guard !recovered.isEmpty else {
            store.discardJournal(id: id)
            return nil
        }
        // The id carries the start time, which matters: re-extracting a recovered
        // meeting against today's date would reinterpret every "Thursday" in it.
        let started = Self.startTime(fromMeetingId: id) ?? Date()
        let items = (try? engine.extract(events: recovered, reference: started)) ?? []
        let meeting = Meeting(
            id: id,
            title: "\(Self.title(for: started)) (recovered)",
            startedAt: ISO8601DateFormatter().string(from: started),
            endedAt: nil,
            processing: .onDevice,
            events: recovered,
            items: items
        )
        try? store.save(meeting)
        store.discardJournal(id: id)
        return meeting
    }
}
