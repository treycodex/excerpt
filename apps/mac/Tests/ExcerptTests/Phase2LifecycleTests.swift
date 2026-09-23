import AVFoundation
import CoreMedia
import Foundation
import Testing
@testable import Excerpt

@MainActor
struct Phase2LifecycleTests {
    private static var repoRoot: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func root() -> URL {
        URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase2-\(UUID().uuidString)")
    }

    private func engine() throws -> CoreEngine {
        try CoreEngine(engineURL: Self.repoRoot.appending(path: "apps/mac/Resources/excerpt-engine.js"))
    }

    private func preferences() -> PreferencesStore {
        PreferencesStore(defaults: UserDefaults(suiteName: "excerpt-phase2-\(UUID().uuidString)")!)
    }

    private func overlay() -> OverlayController {
        OverlayController(defaults: UserDefaults(suiteName: "excerpt-phase2-overlay-\(UUID().uuidString)")!)
    }

    private func enhancer(
        store: MeetingStore, preferences: PreferencesStore,
        summarize: @escaping MeetingEnhancer.Summarize = { _, _, _ in
            NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [])
        }
    ) -> MeetingEnhancer {
        MeetingEnhancer(
            store: store, preferences: preferences, summarize: summarize,
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
    }

    private func session(
        store: MeetingStore, capture: LifecycleCapture,
        transcribers: @escaping () -> [SourceKind: any MeetingTranscribing],
        enhancer customEnhancer: MeetingEnhancer? = nil,
        overlay customOverlay: OverlayController? = nil
    ) throws -> MeetingSession {
        let prefs = preferences()
        return MeetingSession(
            engine: try engine(), store: store, preferences: prefs,
            overlay: customOverlay ?? overlay(), capture: capture,
            makeTranscribers: transcribers,
            enhancer: customEnhancer ?? enhancer(store: store, preferences: prefs))
    }

    private func waitUntil(_ condition: @escaping @MainActor () -> Bool) async -> Bool {
        for _ in 0..<200 {
            if condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return condition()
    }

    @Test func `selected input loss interrupts and preserves the partial meeting`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let capture = LifecycleCapture()
        let session = try session(store: store, capture: capture) {
            [.system: LifecycleTranscriber(kind: .system), .microphone: LifecycleTranscriber(kind: .microphone)]
        }
        await session.start()
        session.selectedMicrophoneDisconnected("USB")
        #expect(await waitUntil { session.lastSaved != nil })
        #expect(session.lastSaved?.finishReason == .interrupted)
        #expect(session.lastSaved?.captureError?.contains("USB") == true)
        #expect(!capture.running)
    }

    @Test func `immediate stop during startup cannot return to listening`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let startGate = LifecycleGate()
        let system = LifecycleTranscriber(kind: .system, startGate: startGate)
        let microphone = LifecycleTranscriber(kind: .microphone)
        let capture = LifecycleCapture()
        let session = try session(store: store, capture: capture) {
            [.system: system, .microphone: microphone]
        }
        var states: [MeetingSession.State] = []
        session.onStateChange = { states.append(session.state) }

        let starting = Task { await session.start() }
        await startGate.waitUntilEntered()
        let stopping = Task { await session.stop() }
        await startGate.open()
        await starting.value
        await stopping.value

        #expect(states.contains(.starting))
        #expect(states.contains(.finishing(.stopped)))
        #expect(!states.contains { if case .listening = $0 { true } else { false } })
        #expect(session.lastSaved?.finishReason == .stopped)
        #expect(capture.startCount == 0)
        #expect(capture.stopCount == 1)
    }

    @Test func `partial capture startup failure releases every started resource`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let system = LifecycleTranscriber(kind: .system)
        let microphone = LifecycleTranscriber(kind: .microphone)
        let capture = LifecycleCapture(failStart: true)
        let session = try session(store: store, capture: capture) {
            [.system: system, .microphone: microphone]
        }

        await session.start()

        #expect(session.state == .failed("Excerpt could not hear the meeting. synthetic capture start failure"))
        #expect(capture.stopCount == 1)
        #expect(await system.stopCount == 1)
        #expect(await microphone.stopCount == 1)
        #expect(store.list().isEmpty)
        #expect(session.activeMeeting() == nil)
    }

    @Test func `stop while capture start is suspended cannot leak or fail the session`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let captureGate = LifecycleGate()
        let capture = LifecycleCapture(startGate: captureGate)
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }

        let starting = Task { await session.start() }
        await captureGate.waitUntilEntered()
        let stopping = Task { await session.stop() }
        await stopping.value
        await starting.value

        #expect(capture.startCount == 1)
        #expect(capture.stopCount >= 1)
        #expect(!capture.running)
        #expect(session.lastSaved?.finishReason == .stopped)
        #expect(session.state == .completed(id: session.meetingId))
    }

    @Test func `repeated start and end are idempotent and two meetings get distinct files`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }
        var completions: [String] = []
        session.onMeetingFinished = { completions.append($0.id) }

        await session.start()
        let firstID = session.meetingId
        await session.start()
        async let firstStop: Void = session.stop()
        async let repeatedStop: Void = session.stop()
        _ = await (firstStop, repeatedStop)

        await session.start()
        let secondID = session.meetingId
        await session.stop()

        #expect(firstID != secondID)
        #expect(capture.startCount == 2)
        #expect(capture.stopCount == 2)
        #expect(completions == [firstID, secondID])
        #expect(Set(store.list().map(\.id)) == Set([firstID, secondID]))
    }

    @Test func `capture loss persists interruption and opens the exact partial meeting once`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }
        var opened: [String] = []
        session.onMeetingFinished = { opened.append($0.id) }

        await session.start()
        let interruptedID = session.meetingId
        capture.fail("display stream disappeared")
        #expect(await waitUntil { !session.state.isActive })

        let saved = try store.load(id: interruptedID)
        #expect(saved.finishReason == .interrupted)
        #expect(saved.captureError == "display stream disappeared")
        #expect(opened == [interruptedID])
        #expect(session.status == "The meeting was interrupted — your notes so far were saved")
        #expect(session.state == .interrupted(
            id: interruptedID,
            message: "The meeting was interrupted — your notes so far were saved"))
    }

    @Test func `save failure never opens an older meeting and retry uses the recovery snapshot`() async throws {
        struct WriteFailure: Error {}
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        var failMeetingWrite = false
        let store = try MeetingStore(root: directory, faults: MeetingStore.Faults(
            beforeWrite: { url in
                if failMeetingWrite && url.path.contains("/meetings/") { throw WriteFailure() }
            }))
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }
        var opened: [String] = []
        session.onMeetingFinished = { opened.append($0.id) }

        await session.start()
        let previousID = session.meetingId
        await session.stop()
        #expect(opened == [previousID])
        #expect(await waitUntil {
            (try? store.load(id: previousID).generationStatus?.state) == .ready
        })

        failMeetingWrite = true
        await session.start()
        let failedID = session.meetingId
        await session.stop()

        #expect(session.state == .failed("Could not write the notes file."))
        #expect(session.lastSaved == nil)
        #expect(opened == [previousID])
        #expect(session.canRetryFailedSave)
        #expect(store.recoverable().contains(failedID))

        failMeetingWrite = false
        let retried = try #require(try session.retryFailedSave())
        #expect(retried.id == failedID)
        #expect(opened == [previousID, failedID])
        #expect(try store.load(id: failedID).finishReason == .stopped)
        #expect(!session.canRetryFailedSave)
    }

    @Test func `quit cancels an open region picker drains the save and does not await enhancement`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let prefs = preferences()
        let generation = LifecycleGate()
        let delayedEnhancer = enhancer(store: store, preferences: prefs) { _, _, _ in
            await generation.wait()
            return NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [])
        }
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = MeetingSession(
            engine: try engine(), store: store, preferences: prefs, overlay: overlay(),
            capture: capture, makeTranscribers: { factory.make() }, enhancer: delayedEnhancer)
        await session.start()
        let meetingID = session.meetingId

        let picker = LifecycleGate()
        let screenshots = MeetingScreenshotCoordinator()
        var attached = false
        screenshots.start(
            meetingID: meetingID,
            capture: {
                await picker.wait()
                return MeetingScreenshot.Capture(
                    dataURL: "data:image/png;base64,c3ludGhldGlj",
                    capturedAt: Date(), origin: "excerpt")
            },
            onCapture: { id, shot in
                attached = (try? session.addScreenshot(shot, for: id)) != nil
            },
            onFailure: { _ in })
        await picker.waitUntilEntered()

        let termination = ApplicationTerminationCoordinator()
        var replied = false
        let decision = termination.request(
            requiresCleanup: true,
            cancelPendingUI: { screenshots.cancel() },
            cleanup: { await session.stop() },
            reply: { replied = $0 })
        if case .terminateNow = decision { Issue.record("active session terminated without deferral") }

        #expect(await waitUntil { replied })
        #expect(!screenshots.isCapturing)
        #expect(try store.load(id: meetingID).finishReason == .stopped)
        await generation.waitUntilEntered()
        #expect(replied, "optional enhancement must not hold the termination reply")

        await picker.open()
        await Task.yield()
        #expect(!attached, "a cancelled picker cannot attach a late image")
        await generation.open()
    }

    @Test func `caption preference survives the overlay window being hidden`() {
        let defaults = UserDefaults(suiteName: "excerpt-phase2-caption-\(UUID().uuidString)")!
        let first = OverlayController(defaults: defaults)
        first.setCaptionsEnabled(false)
        first.hide()
        let reloaded = OverlayController(defaults: defaults)
        #expect(!reloaded.captionsEnabled)
        #expect(!reloaded.visible)
        reloaded.setCaptionsEnabled(true)
        reloaded.hide()
        #expect(OverlayController(defaults: defaults).captionsEnabled)
    }

    @Test func `unfinished durable generation resumes after launch`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let source = Meeting(
            id: "unfinished-generation", title: "Synthetic", startedAt: "2026-09-22T01:00:00Z",
            endedAt: "2026-09-22T01:10:00Z", processing: .onDevice,
            events: [], items: [],
            notes: NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []),
            sourceRevision: 0, schemaVersion: 1, revision: 2, documentRevision: 0,
            generationStatus: NotesGenerationStatus(
                state: .running, generationId: "unfinished-job", sourceRevision: 0,
                inputFingerprint: MeetingEnhancer.inputFingerprint(Meeting(
                    id: "unfinished-generation", title: "Synthetic", startedAt: "2026-09-22T01:00:00Z",
                    processing: .onDevice, events: [], items: []))))
        try store.save(source)
        let capture = LifecycleCapture()
        let prefs = preferences()
        let resumeEnhancer = enhancer(store: store, preferences: prefs) { _, _, _ in
            NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "resumed", kind: "paragraph", text: "Resumed notes", evidence: [])
            ])
        }
        let session = MeetingSession(
            engine: try engine(), store: store, preferences: prefs, overlay: overlay(),
            capture: capture, makeTranscribers: { TranscriberFactory().make() },
            enhancer: resumeEnhancer)

        session.resumePendingEnhancements()
        #expect(await waitUntil {
            (try? store.load(id: source.id).generationStatus?.state) == .ready
        })
        #expect(try store.load(id: source.id).notes?.blocks?.first?.text == "Resumed notes")
    }

    @Test func `recovery warning clears after durable writes recover`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        var failJournal = true
        let store = try MeetingStore(root: directory, faults: MeetingStore.Faults(
            beforeJournalAppend: { _ in if failJournal { throw LifecycleFailure(message: "journal unavailable") } }))
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }
        await session.start()
        let run = try #require(factory.runs.first)
        let system = try #require(run[.system])

        await system.emit(Segment(start: 0, end: 1, text: "First durable sentence."))
        #expect(await waitUntil { session.events.count == 1 })
        #expect(session.recoveryHealth == .degraded("transcript recovery unavailable"))

        failJournal = false
        await system.emit(Segment(start: 3, end: 4, text: "Second durable sentence."))
        #expect(await waitUntil { session.events.count == 2 && session.recoveryHealth == .healthy })
        #expect(session.status == "Listening")
        await session.stop()
    }

    @Test func `headphone suggestion is triggered by measured live echo suppression`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let capture = LifecycleCapture()
        let factory = TranscriberFactory()
        let session = try session(store: store, capture: capture) { factory.make() }
        var suggestions = 0
        session.onHeadphoneSuggestion = { suggestions += 1 }
        await session.start()
        let run = try #require(factory.runs.first)
        let system = try #require(run[.system])
        let microphone = try #require(run[.microphone])

        for index in 0..<4 {
            let start = Double(index * 3)
            let words = "The same synthetic phrase is audible twice."
            await system.emit(Segment(start: start, end: start + 1, text: words))
            await microphone.emit(Segment(start: start, end: start + 1, text: words))
        }
        #expect(await waitUntil { suggestions == 1 })
        #expect(session.suppressedEchoes >= 3)
        await session.stop()
    }
}

private struct LifecycleFailure: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

private actor LifecycleGate {
    private var opened = false
    private var entered = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var enteredWaiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        entered = true
        enteredWaiters.forEach { $0.resume() }
        enteredWaiters = []
        if opened { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func waitUntilEntered() async {
        if entered { return }
        await withCheckedContinuation { enteredWaiters.append($0) }
    }

    func open() {
        opened = true
        waiters.forEach { $0.resume() }
        waiters = []
    }
}

private final class LifecycleCapture: MeetingCapturing {
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var running = false
    private let failStart: Bool
    private let startGate: LifecycleGate?
    private var onStreamError: ((String) -> Void)?
    private var generation = 0

    init(failStart: Bool = false, startGate: LifecycleGate? = nil) {
        self.failStart = failStart
        self.startGate = startGate
    }

    func statistics() -> [SourceKind: SourceStats] {
        [.system: SourceStats(), .microphone: SourceStats()]
    }

    func start(
        onBuffer: @escaping (SourceKind, AVAudioPCMBuffer, CMTime) -> Void,
        onStreamError: @escaping (String) -> Void
    ) async throws {
        startCount += 1
        generation += 1
        let startGeneration = generation
        self.onStreamError = onStreamError
        if let startGate { await startGate.wait() }
        guard generation == startGeneration else { throw CancellationError() }
        if failStart { throw LifecycleFailure(message: "synthetic capture start failure") }
        running = true
    }

    func stop() async {
        stopCount += 1
        generation += 1
        running = false
        if let startGate { await startGate.open() }
        onStreamError = nil
    }

    func fail(_ message: String) {
        running = false
        onStreamError?(message)
    }
}

private actor LifecycleTranscriber: MeetingTranscribing {
    nonisolated let kind: SourceKind
    nonisolated let segments: AsyncStream<Segment>
    nonisolated let live: AsyncStream<SourceTranscriber.LiveEdge>
    private let segmentContinuation: AsyncStream<Segment>.Continuation
    private let liveContinuation: AsyncStream<SourceTranscriber.LiveEdge>.Continuation
    private let startGate: LifecycleGate?
    private let failStart: Bool
    private(set) var startCount = 0
    private(set) var stopCount = 0

    init(kind: SourceKind, startGate: LifecycleGate? = nil, failStart: Bool = false) {
        self.kind = kind
        self.startGate = startGate
        self.failStart = failStart
        var segmentContinuation: AsyncStream<Segment>.Continuation!
        segments = AsyncStream(bufferingPolicy: .unbounded) { segmentContinuation = $0 }
        self.segmentContinuation = segmentContinuation
        var liveContinuation: AsyncStream<SourceTranscriber.LiveEdge>.Continuation!
        live = AsyncStream(bufferingPolicy: .bufferingNewest(1)) { liveContinuation = $0 }
        self.liveContinuation = liveContinuation
    }

    func statistics() -> TranscriptStats { TranscriptStats() }

    func start() async throws {
        startCount += 1
        if let startGate { await startGate.wait() }
        if failStart { throw LifecycleFailure(message: "synthetic transcriber start failure") }
    }

    func feed(_ buffer: AVAudioPCMBuffer, at: CMTime) async {}

    func emit(_ segment: Segment) { segmentContinuation.yield(segment) }

    func stop() async {
        stopCount += 1
        if let startGate { await startGate.open() }
        segmentContinuation.finish()
        liveContinuation.finish()
    }

    func captureOffsetSeconds() -> Double { 0 }
}

@MainActor
private final class TranscriberFactory {
    private(set) var runs: [[SourceKind: LifecycleTranscriber]] = []

    func make() -> [SourceKind: any MeetingTranscribing] {
        let run: [SourceKind: LifecycleTranscriber] = [
            .system: LifecycleTranscriber(kind: .system),
            .microphone: LifecycleTranscriber(kind: .microphone),
        ]
        runs.append(run)
        return run
    }
}
