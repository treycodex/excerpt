import Foundation
import Testing
@testable import Excerpt

@MainActor
struct Phase1PersistenceTests {
    private func root() -> URL {
        URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase1-\(UUID().uuidString)")
    }

    private func event(text: String = "Use the revised launch plan.") -> TranscriptEvent {
        TranscriptEvent(id: "event-1", sessionId: "meeting-a", role: .remote,
                        speakerLabel: "SPEAKER", text: text, isFinal: true,
                        tArrived: 1_000, tStart: 1, tEnd: 3)
    }

    private func meeting(id: String = "meeting-a") -> Meeting {
        Meeting(
            id: id, title: "Synthetic plan", startedAt: "2026-09-22T01:00:00Z",
            endedAt: "2026-09-22T01:30:00Z", processing: .onDevice,
            events: [event()], items: [],
            notes: NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []),
            images: [], sourceRevision: 0, schemaVersion: 1, revision: 3,
            documentRevision: 1)
    }

    private func engine() throws -> CoreEngine {
        let root = URL(filePath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try CoreEngine(engineURL: root.appending(path: "apps/mac/Resources/excerpt-engine.js"))
    }

    private func mutation(
        _ meeting: Meeting, id: String = UUID().uuidString,
        changes: [MeetingChange]
    ) -> MeetingMutation {
        MeetingMutation(
            operationId: id, meetingId: meeting.id,
            baseRevision: meeting.revision ?? 0,
            baseDocumentRevision: meeting.documentRevision ?? 0,
            baseSourceRevision: meeting.sourceRevision ?? 0,
            changes: changes)
    }

    @Test func `TypeScript mutation JSON decodes through the native contract`() throws {
        let json = #"{"operationId":"web-op","meetingId":"meeting-a","baseRevision":3,"baseDocumentRevision":1,"baseSourceRevision":0,"changes":[{"type":"setDocument","document":null,"suggestedNotes":null}]}"#
        let decoded = try JSONDecoder.excerpt.decode(MeetingMutation.self, from: Data(json.utf8))
        #expect(decoded.operationId == "web-op")
        #expect(decoded.changes == [.setDocument(document: nil, suggestedNotes: nil)])
    }

    @Test func `finished A persists every editor-owned field while B is live`() throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let original = meeting()
        try store.save(original)

        let corrected = TranscriptEvent(
            id: "event-1", sessionId: original.id, role: .remote, speakerLabel: "SPEAKER",
            text: "Use the corrected launch plan.", isFinal: true, tArrived: 1_000,
            tStart: 1, tEnd: 3, originalText: original.events[0].text,
            corrections: [TranscriptCorrection(text: "Use the corrected launch plan.", correctedAt: "2026-09-22T02:00:00Z")])
        let evidence = Evidence(eventIds: [corrected.id], tArrived: 1_000,
                                quote: corrected.text, speakerLabel: corrected.speakerLabel)
        let reviewed = Item(
            id: "review-1", category: .action, state: .decided, title: "Use the corrected plan",
            evidence: [evidence], assignee: .you, salience: 1,
            dismissed: false, completed: true, confirmed: true, needsReview: false)
        let image = MeetingImage(
            id: "image-1", dataUrl: "data:image/png;base64,c3ludGhldGlj",
            capturedAt: "2026-09-22T01:10:00Z", at: 600_000,
            caption: "Corrected launch diagram", origin: "import")
        let removed = NoteBlock(id: "removed", kind: "paragraph", text: "Do not restore",
                                evidence: [], userEdited: true)
        let document = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "image-image-1", kind: "image", text: image.caption,
                      evidence: [], at: image.at, imageId: image.id, userEdited: true)
        ], deletedBlocks: [removed])

        let liveB = meeting(id: "meeting-b")
        var routedToLiveB = false
        let bridge = NotesBridge(
            store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            activeMeeting: { id in id == nil || id == liveB.id ? liveB : nil },
            mutateLiveMeeting: { operation in
                if operation.meetingId == liveB.id { routedToLiveB = true }
                return nil
            })
        let operation = mutation(original, changes: [
            .correctTranscript(events: [corrected], items: [reviewed], document: document,
                               suggestedNotes: nil, images: [image], sourceRevision: 1)
        ])

        let acknowledgment = try bridge.applyMutation(operation)
        let reloaded = try store.load(id: original.id)

        #expect(acknowledgment.status == .applied)
        #expect(!routedToLiveB)
        #expect(reloaded.events[0].corrections?.count == 1)
        #expect(reloaded.items[0].confirmed == true)
        #expect(reloaded.items[0].completed == true)
        #expect(reloaded.images?[0].dataUrl == image.dataUrl)
        #expect(reloaded.images?[0].caption == image.caption)
        #expect(reloaded.notes?.blocks?.first?.imageId == image.id)
        #expect(reloaded.notes?.deletedBlocks == [removed])
        #expect(reloaded.sourceRevision == 1)
        #expect(reloaded.revision == 4)
    }

    @Test func `stale meeting revision rebases document writing over newer speech and images`() throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        var current = meeting()
        current.revision = 8
        current.documentRevision = 2
        current.events.append(event(text: "Speech that arrived between keystrokes."))
        current.images = [MeetingImage(
            id: "native", dataUrl: "data:image/png;base64,bmF0aXZl",
            capturedAt: "2026-09-22T01:12:00Z", at: 720_000, caption: "Native capture")]
        try store.save(current)
        let writing = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "mine", kind: "paragraph", text: "My writing survives.", evidence: [], userEdited: true)
        ])
        var staleBase = current
        staleBase.revision = 7
        let operation = MeetingMutation(
            operationId: "stale-independent", meetingId: current.id,
            baseRevision: 7, baseDocumentRevision: 2, baseSourceRevision: 0,
            changes: [.setDocument(document: writing, suggestedNotes: nil)])

        let result = try store.apply(operation)

        #expect(result.status == .rebased)
        #expect(result.meeting.events.count == 2)
        #expect(result.meeting.images?.first?.id == "native")
        #expect(result.meeting.notes?.blocks?.first?.text == "My writing survives.")
    }

    @Test func `operation identifiers make repeated acknowledgments idempotent`() throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let original = meeting()
        try store.save(original)
        let operation = mutation(original, id: "same-operation", changes: [.setTitle(title: "One durable title")])
        let first = try store.apply(operation)
        let repeated = try store.apply(operation)
        #expect(first.status == .applied)
        #expect(repeated.status == .duplicate)
        #expect(repeated.revision == first.revision)
        #expect(try store.load(id: original.id).appliedOperationIds == ["same-operation"])
    }

    @Test func `document conflict keeps local writing retryable and generated notes visible`() throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        var generated = meeting()
        generated.revision = 6
        generated.documentRevision = 3
        generated.notes = NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "generated", kind: "paragraph", text: "Generated result", evidence: [])
        ], generation: NotesGeneration(
            provider: "apple", model: "fixture", generatedAt: "2026-09-22T02:00:00Z",
            sourceRevision: 0, style: "balanced"))
        try store.save(generated)
        let local = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "mine", kind: "paragraph", text: "Writing during generation", evidence: [], userEdited: true)
        ])
        let stale = MeetingMutation(
            operationId: "write-stale", meetingId: generated.id,
            baseRevision: 5, baseDocumentRevision: 2, baseSourceRevision: 0,
            changes: [.setDocument(document: local, suggestedNotes: nil)])

        let conflict = try store.apply(stale)
        #expect(conflict.status == .conflict)
        #expect(try store.load(id: generated.id).notes?.blocks?.first?.text == "Generated result")

        let retry = MeetingMutation(
            operationId: "write-retry", meetingId: generated.id,
            baseRevision: conflict.revision, baseDocumentRevision: conflict.documentRevision,
            baseSourceRevision: conflict.sourceRevision,
            changes: [.setDocument(document: local, suggestedNotes: generated.notes)])
        let saved = try store.apply(retry)
        #expect(saved.meeting.notes?.blocks?.first?.text == "Writing during generation")
        #expect(saved.meeting.suggestedNotes?.blocks?.first?.text == "Generated result")
    }

    @Test func `durable save delete and export errors are acknowledged honestly`() async throws {
        struct Failure: Error {}
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        var failWrites = false
        var failRemoves = false
        let store = try MeetingStore(root: directory, faults: MeetingStore.Faults(
            beforeWrite: { _ in if failWrites { throw Failure() } },
            beforeRemove: { _ in if failRemoves { throw Failure() } }))
        let original = meeting()
        try store.save(original)
        failWrites = true
        #expect(throws: Failure.self) {
            _ = try store.apply(self.mutation(original, changes: [.setTitle(title: "Not durable")]))
        }
        #expect(try store.load(id: original.id).title == original.title)
        failWrites = false
        failRemoves = true
        let bridge = NotesBridge(
            store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            exporter: FixtureExporter(result: .failure(Failure())))
        #expect(throws: Failure.self) { try bridge.deleteMeeting(original.id) }
        #expect(store.list().contains { $0.id == original.id })
        await #expect(throws: Failure.self) {
            _ = try await bridge.export(contents: "notes", suggesting: "notes.md", html: false)
        }
        let cancelled = NotesBridge(
            store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            exporter: FixtureExporter(result: .success(.cancelled)))
        #expect(try await cancelled.export(contents: "notes", suggesting: "notes.md", html: false) == .cancelled)
    }

    @Test func `deletion invalidates running generation and queued mutations cannot revive it`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        var source = meeting()
        source.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-1", sourceRevision: 0)
        try store.save(source)
        let gate = ProviderGate()
        let preferences = PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let enhancer = MeetingEnhancer(
            store: store, preferences: preferences,
            summarize: { meeting, _, _ in try await gate.run(meeting: meeting) },
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
        let task = enhancer.start(source: source) { _ in }
        await gate.waitUntilStarted()

        try store.delete(id: source.id)
        enhancer.cancel(id: source.id)
        await gate.finish()
        _ = await task.value

        #expect(store.list().isEmpty)
        #expect(throws: MeetingMutationFailure.self) {
            _ = try store.apply(self.mutation(source, id: "queued-after-delete",
                                               changes: [.setTitle(title: "Revived")]))
        }
        #expect(store.list().isEmpty)
    }

    @Test func `automatic notes publish to an untouched meeting and writing during generation becomes authoritative`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let preferences = PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!)

        var untouched = meeting(id: "untouched")
        untouched.notes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [])
        untouched.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-untouched", sourceRevision: 0)
        try store.save(untouched)
        let immediate = MeetingEnhancer(
            store: store, preferences: preferences,
            summarize: { _, _, _ in NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "automatic", kind: "paragraph", text: "Automatic native notes", evidence: [])
            ]) },
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
        var published: [Meeting] = []
        let untouchedTask = immediate.start(source: untouched) { published.append($0) }
        _ = await untouchedTask.value
        #expect(published.last?.notes?.blocks?.first?.text == "Automatic native notes")
        #expect(try store.load(id: untouched.id).generationStatus?.state == .ready)

        var writing = meeting(id: "writing")
        writing.notes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [])
        writing.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-writing", sourceRevision: 0)
        try store.save(writing)
        let gate = ProviderGate()
        let delayed = MeetingEnhancer(
            store: store, preferences: preferences,
            summarize: { source, _, _ in try await gate.run(meeting: source) },
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
        let writingTask = delayed.start(source: writing) { _ in }
        await gate.waitUntilStarted()
        let running = try store.load(id: writing.id)
        let local = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "local", kind: "paragraph", text: "Written while generation ran", evidence: [], userEdited: true)
        ])
        _ = try store.apply(mutation(running, changes: [
            .setDocument(document: local, suggestedNotes: nil)
        ]))
        await gate.finish()
        _ = await writingTask.value
        let completed = try store.load(id: writing.id)
        #expect(completed.notes?.blocks?.first?.text == "Written while generation ran")
        #expect(completed.suggestedNotes?.blocks?.first?.text == "Late generation")
        #expect(completed.generationStatus?.state == .ready)
    }

    @Test func `enhanced wording retains automatic captures in the saved document`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        let engine = try engine()
        var source = meeting()
        source.events = [event(text: "We decided the revised launch plan needs fewer steps before release.")]
        let image = MeetingImage(id: "capture", dataUrl: "data:image/png;base64,c3ludGhldGlj",
                                 capturedAt: source.startedAt, at: 2_000, caption: "",
                                 origin: "excerpt", context: MeetingMoments.context(at: 2_000, events: source.events))
        source.images = [image]
        source.notes = try engine.notes(for: source)
        source.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-visual", sourceRevision: 0,
            inputFingerprint: MeetingEnhancer.inputFingerprint(source))
        try store.save(source)
        let evidence = Evidence(eventIds: ["event-1"], tArrived: 1_000,
                                quote: source.events[0].text, speakerLabel: "SPEAKER", tStart: 1)
        let enhancer = MeetingEnhancer(
            store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            summarize: { _, _, _ in NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "enhanced", kind: "bullet", text: "Revised launch plan needs fewer steps.",
                          evidence: [evidence], at: 1_000)
            ]) },
            fallback: { try engine.notes(for: $0) },
            shapeNotice: { _ in "" },
            compose: { try engine.composeNotes(for: $0, wording: $1) })
        let task = enhancer.start(source: source) { _ in }
        _ = await task.value
        let saved = try store.load(id: source.id)
        #expect(saved.notes?.method == "on-device")
        #expect(saved.notes?.blocks?.filter { $0.imageId == image.id }.count == 1)
        #expect(saved.notes?.blocks?.contains { $0.text.contains("Revised launch plan") } == true)
        #expect(saved.suggestedNotes == nil)
    }

    @Test func `a transcript correction cancels stale automatic wording`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        var source = meeting(id: "corrected-during-generation")
        source.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-corrected", sourceRevision: 0,
            inputFingerprint: MeetingEnhancer.inputFingerprint(source))
        try store.save(source)
        let gate = ProviderGate()
        let enhancer = MeetingEnhancer(
            store: store, preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            summarize: { meeting, _, _ in try await gate.run(meeting: meeting) },
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
        let task = enhancer.start(source: source) { _ in }
        await gate.waitUntilStarted()
        let duplicate = enhancer.start(source: source) { _ in }
        #expect(await gate.numberOfStarts == 1)
        let running = try store.load(id: source.id)
        var corrected = running.events[0]
        corrected.text = "Use the corrected launch plan."
        _ = try store.apply(mutation(running, changes: [
            .correctTranscript(events: [corrected], items: running.items,
                               document: running.notes, suggestedNotes: nil,
                               images: running.images ?? [], sourceRevision: 1)
        ]))
        await gate.finish()
        _ = await task.value
        _ = await duplicate.value
        let saved = try store.load(id: source.id)
        #expect(saved.events[0].text == corrected.text)
        #expect(saved.generationStatus?.state == .cancelled)
        #expect(saved.suggestedNotes == nil)
    }

    @Test func `journal failure reports a degraded recovery boundary`() throws {
        struct Failure: Error {}
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory, faults: MeetingStore.Faults(
            beforeJournalAppend: { _ in throw Failure() }))
        #expect(!store.append(event(), toJournalFor: "meeting-a"))
    }
}

@MainActor
private final class FixtureExporter: NotesExporting {
    let result: Result<ExportOutcome, Error>
    init(result: Result<ExportOutcome, Error>) { self.result = result }
    func export(contents: String, suggesting filename: String, html: Bool) async throws -> ExportOutcome {
        try result.get()
    }
}

private actor ProviderGate {
    private var started = false
    private var starts = 0
    private var startWaiters: [CheckedContinuation<Void, Never>] = []
    private var result: CheckedContinuation<NotesDocument, Error>?

    func run(meeting: Meeting) async throws -> NotesDocument {
        started = true
        starts += 1
        startWaiters.forEach { $0.resume() }
        startWaiters = []
        return try await withCheckedThrowingContinuation { result = $0 }
    }

    var numberOfStarts: Int { starts }

    func waitUntilStarted() async {
        if started { return }
        await withCheckedContinuation { startWaiters.append($0) }
    }

    func finish() {
        result?.resume(returning: NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "late", kind: "paragraph", text: "Late generation", evidence: [])
        ]))
        result = nil
    }
}
