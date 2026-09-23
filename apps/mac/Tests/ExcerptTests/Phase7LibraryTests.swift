import Foundation
import Testing
@testable import Excerpt

@MainActor
struct Phase7LibraryTests {
    private func fixture() -> Meeting {
        let said = "Ask Ángela to review the launch transcript."
        let event = TranscriptEvent(id: "spoken", sessionId: "library", role: .remote,
            speakerLabel: "SPEAKER", text: said, isFinal: true, tArrived: 1000)
        let evidence = Evidence(eventIds: [event.id], tArrived: 1000,
            quote: said, speakerLabel: "SPEAKER")
        let decision = Item(id: "decision", category: .decision, state: .decided,
            title: "Approve launch", evidence: [evidence], assignee: .you, salience: 1)
        return Meeting(id: "library", title: "Synthetic planning", startedAt: "2026-09-23T09:00:00Z",
            endedAt: "2026-09-23T10:30:00Z", processing: .onDevice,
            events: [event, TranscriptEvent(id: "interim", sessionId: "library", role: .you,
                speakerLabel: "YOU", text: "Unsettled secret wording", isFinal: false, tArrived: 2000)],
            items: [decision], notes: NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "note", kind: "paragraph", text: "The draft needs legal review.", evidence: [evidence]),
                NoteBlock(id: "image-shot", kind: "image", text: "Pricing chart", evidence: [], imageId: "shot")
            ]), images: [MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
                capturedAt: "2026-09-23T09:10:00Z", at: 600_000, caption: "Pricing chart")])
    }

    @Test func `library and search bridge responses omit image bytes and full text`() async throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-library-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let original = fixture()
        try store.save(original)
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let bridge = NotesBridge(store: store, preferences: PreferencesStore(defaults: defaults))

        let listJSON = try #require(try await bridge.dispatch("listMeetings") as? String)
        let entries = try JSONDecoder.excerpt.decode([MeetingLibraryEntry].self, from: Data(listJSON.utf8))
        #expect(entries.count == 1)
        #expect(entries[0].noteCount == 2)
        #expect(entries[0].decidedCount == 1)
        #expect(entries[0].mineCount == 1)
        #expect(!listJSON.contains("data:image"))
        #expect(!listJSON.contains("launch transcript"))

        let transcriptJSON = try #require(try await bridge.dispatch("searchMeetings", arguments: ["angela"]) as? String)
        let transcript = try JSONDecoder.excerpt.decode([MeetingSearchHit].self, from: Data(transcriptJSON.utf8))
        #expect(transcript.count == 1)
        #expect(transcript[0].kind == "transcript")
        #expect(transcript[0].eventId == "spoken")
        let range = NSRange(location: transcript[0].offset, length: transcript[0].length)
        #expect((transcript[0].snippet as NSString).substring(with: range) == "Ángela")
        #expect(!transcriptJSON.contains("data:image"))
        #expect(try await bridge.dispatch("searchMeetings", arguments: ["Unsettled secret"]) as? String == "[]")
        #expect(MeetingLibrarySearch.search([original], query: "legal").first?.kind == "note")
        #expect(MeetingLibrarySearch.search([original], query: "pricing").first?.kind == "moment")
        #expect(MeetingLibrarySearch.search([original], query: "planning").first?.kind == "title")

        // The small projection never changes the saved full record or its image.
        #expect(try store.load(id: original.id).images == original.images)
    }
}
