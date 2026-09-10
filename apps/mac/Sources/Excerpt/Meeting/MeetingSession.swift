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

        // Echo suppression, carried over from the web build because ScreenCaptureKit
        // does not solve it either: without headphones the microphone hears the far
        // side, and the same words arrive on both streams. `echoCancellation` is no
        // help — it cancels a render stream, not a room.
        if role == .you, isEcho(segment.text) {
            suppressedEchoes += 1
            return
        }

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

    /// A microphone segment that repeats what the far side just said.
    private func isEcho(_ text: String) -> Bool {
        let recent = events.suffix(12).filter {
            $0.role == .remote && clock.arrivedMilliseconds() - $0.tArrived < 6000
        }
        guard !recent.isEmpty else { return false }

        let tokens = Set(Self.tokens(of: text))
        guard tokens.count >= 3 else { return false }        // too short to judge

        return recent.contains { remote in
            let other = Set(Self.tokens(of: remote.text))
            guard !other.isEmpty else { return false }
            let shared = tokens.intersection(other).count
            return Double(shared) / Double(tokens.count) >= 0.6
        }
    }

    private static func tokens(of text: String) -> [String] {
        text.lowercased()
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
            .filter { $0.count > 2 }
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
        await capture.stop()
        // Stopping the transcribers promotes the tail, which flows through the pumps
        // as ordinary settled speech and lands in the journal like everything else.
        for (_, transcriber) in transcribers { await transcriber.stop() }
        for pump in pumps { _ = await pump.value }
        pumps = []

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
        let finals = events.filter(\.isFinal)
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

    /// The end-of-meeting line: what was found, in the user's terms.
    private func summary(of meeting: Meeting) -> String {
        guard !meeting.items.isEmpty else {
            return meeting.events.isEmpty
                ? "Nothing was heard — check the microphone and try again"
                : "Nothing worth noting was said"
        }
        let decided = meeting.items.filter { $0.state == .decided }.count
        let yours = meeting.items.filter { $0.assignee == .you }.count
        var parts = ["\(meeting.items.count) note\(meeting.items.count == 1 ? "" : "s")"]
        if decided > 0 { parts.append("\(decided) settled") }
        if yours > 0 { parts.append("\(yours) for you") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Recovery

    /// Meetings whose journal outlived the app. Offered rather than restored silently:
    /// a transcript appearing without being asked for is its own kind of surprise.
    func recoverableMeetings() -> [String] { store.recoverable() }

    @discardableResult
    func recover(id: String) -> Meeting? {
        let recovered = store.replayJournal(id: id)
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
