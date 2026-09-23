import Foundation
import Testing
@testable import Excerpt

/// Next steps in the document and detailed review are the same `Meeting.items`
/// records. These tests hold the native side of that contract: the editor's typed
/// item mutation lands on the persisted item by id, and later automatic note work
/// never produces a second copy or reverts the reader's changes.
@MainActor
struct Phase6NextStepsTests {
    private func root() -> URL {
        URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase6-\(UUID().uuidString)")
    }

    private func meeting() -> Meeting {
        let event = TranscriptEvent(id: "event-1", sessionId: "next-steps", role: .you,
                                    speakerLabel: "YOU", text: "I will send the revised deck.",
                                    isFinal: true, tArrived: 5_000, tStart: 5, tEnd: 7)
        let evidence = Evidence(eventIds: [event.id], tArrived: 5_000, quote: event.text,
                                speakerLabel: "YOU", tStart: 5)
        return Meeting(
            id: "next-steps", title: "Synthetic next steps", startedAt: "2026-09-22T01:00:00Z",
            endedAt: "2026-09-22T01:30:00Z", processing: .onDevice,
            events: [event],
            items: [Item(id: "deck", category: .action, state: .discussed,
                         title: "I will send the revised deck.", evidence: [evidence],
                         assignee: .unassigned, salience: 1)],
            notes: NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []),
            images: [], sourceRevision: 0, schemaVersion: 1, revision: 2, documentRevision: 1)
    }

    @Test func `a next step edited in the document persists on the same native item`() throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        try store.save(meeting())

        // Exactly what the editor's Notes view sends for complete + assign + reword.
        let json = #"""
        {"operationId":"next-step-edit","meetingId":"next-steps","baseRevision":2,"baseDocumentRevision":1,"baseSourceRevision":0,
         "changes":[{"type":"setReviewItems","items":[{"id":"deck","category":"action","state":"discussed",
           "title":"Send the revised launch deck","evidence":[{"eventIds":["event-1"],"tArrived":5000,
           "quote":"I will send the revised deck.","speakerLabel":"YOU","tStart":5}],
           "assignee":"you","salience":1,"userEdited":true,"completed":true}]}]}
        """#
        let mutation = try JSONDecoder.excerpt.decode(MeetingMutation.self, from: Data(json.utf8))
        let acknowledgment = try store.apply(mutation)
        let saved = try store.load(id: "next-steps")

        #expect(acknowledgment.status == .applied)
        #expect(saved.items.count == 1)
        #expect(saved.items[0].id == "deck")
        #expect(saved.items[0].completed == true)
        #expect(saved.items[0].assignee == .you)
        #expect(saved.items[0].title == "Send the revised launch deck")
        #expect(saved.items[0].evidence.first?.quote == "I will send the revised deck.")
        // An item edit is not a document edit.
        #expect(saved.documentRevision == 1)
        #expect(saved.notes?.blocks == [])

        // Round trip: what native writes back decodes with the same values.
        let encoded = try JSONEncoder().encode(saved)
        let decoded = try JSONDecoder.excerpt.decode(Meeting.self, from: encoded)
        #expect(decoded.items == saved.items)
    }

    @Test func `automatic enhancement after a next-step edit keeps one unchanged item`() async throws {
        let directory = root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try MeetingStore(root: directory)
        var source = meeting()
        source.generationStatus = NotesGenerationStatus(
            state: .queued, generationId: "generation-next-steps", sourceRevision: 0)
        try store.save(source)

        var edited = source.items[0]
        edited.completed = true
        edited.assignee = .you
        edited.userEdited = true
        let stored = try store.load(id: source.id)
        _ = try store.apply(MeetingMutation(
            operationId: "complete-deck", meetingId: source.id,
            baseRevision: stored.revision ?? 0, baseDocumentRevision: stored.documentRevision ?? 0,
            baseSourceRevision: stored.sourceRevision ?? 0,
            changes: [.setReviewItems(items: [edited])]))

        let enhancer = MeetingEnhancer(
            store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!),
            summarize: { _, _, _ in NotesDocument(method: "on-device", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "enhanced", kind: "paragraph", text: "Enhanced wording", evidence: [])
            ]) },
            fallback: { _ in NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: []) },
            shapeNotice: { _ in "" })
        _ = await enhancer.start(source: try store.load(id: source.id)) { _ in }.value

        let finished = try store.load(id: source.id)
        #expect(finished.generationStatus?.state == .ready)
        #expect(finished.items.count == 1)
        #expect(finished.items[0].id == "deck")
        #expect(finished.items[0].completed == true)
        #expect(finished.items[0].assignee == .you)
    }

    @Test func `legacy items without review fields still decode`() throws {
        let json = #"{"id":"old","category":"action","state":"discussed","title":"Old step","evidence":[],"assignee":"unassigned","salience":0.5}"#
        let item = try JSONDecoder.excerpt.decode(Item.self, from: Data(json.utf8))
        #expect(item.completed == nil)
        #expect(item.userEdited == nil)
        #expect(item.assignee == .unassigned)
    }
}
