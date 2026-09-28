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
        #expect(entries[0].noteCount == 1)
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

    @Test func `library index survives reopen and rejects stale sidecars`() throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-index-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let writer = try MeetingStore(root: root)
        let original = fixture()
        try writer.save(original)

        let reopened = try MeetingStore(root: root)
        #expect(reopened.libraryRecords().first?.entry.title == original.title)
        #expect(MeetingLibrarySearch.searchRecords(reopened.libraryRecords(), query: "pricing").first?.kind == "moment")
        var changed = original
        changed.title = "External title with a different length"
        try writer.save(changed)
        #expect(reopened.libraryRecords().first?.entry.title == changed.title)
        #expect(MeetingLibrarySearch.searchRecords(reopened.libraryRecords(), query: "external").count == 1)
        try writer.delete(id: changed.id)
        #expect(reopened.libraryRecords().isEmpty)
    }

    @Test func `applied bridge edit acknowledges durability without echoing image bytes`() async throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-ack-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let original = fixture()
        try store.save(original)
        let bridge = NotesBridge(store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!))
        var published = false
        bridge.onMeetingChange = { _ in published = true }
        let mutation = MeetingMutation(operationId: UUID().uuidString, meetingId: original.id,
            baseRevision: 0, baseDocumentRevision: 0, baseSourceRevision: 0,
            changes: [.setTitle(title: "Durably renamed")])
        let request = String(decoding: try JSONEncoder.excerpt.encode(mutation), as: UTF8.self)
        let reply = try #require(try await bridge.dispatch("mutateMeeting", arguments: [request]) as? String)
        let ack = try JSONDecoder.excerpt.decode(MeetingMutationAcknowledgment.self, from: Data(reply.utf8))
        #expect(ack.status == .applied)
        #expect(ack.imageDataOmitted == true)
        #expect(ack.meeting.images?.first?.dataUrl == "")
        #expect(!reply.contains(original.images![0].dataUrl))
        #expect(!published)
        #expect(try store.load(id: original.id).title == "Durably renamed")
        #expect(try store.load(id: original.id).images == original.images)
    }

    @Test func `captured images survive draft finish caption edit reopen and search`() throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-journey-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        var captured = fixture()
        let second = MeetingImage(id: "shot-2", dataUrl: "data:image/png;base64,d29ybGQ=",
            capturedAt: "2026-09-23T09:20:00Z", at: 1_200_000, caption: "Second chart")
        captured.images?.append(second)
        captured.notes?.blocks?.append(NoteBlock(id: "image-shot-2", kind: "image",
            text: second.caption, evidence: [], imageId: second.id))
        try store.checkpointImages(captured.images!, id: captured.id)
        try store.checkpointDraft(captured)
        let recovery = try MeetingStore(root: root)
        #expect(try recovery.recoverImages(id: captured.id) == captured.images)
        #expect(try recovery.recoverDraft(id: captured.id)?.images == captured.images)

        try recovery.save(captured)
        recovery.discardJournal(id: captured.id)
        let edit = MeetingMutation(operationId: UUID().uuidString, meetingId: captured.id,
            baseRevision: 0, baseDocumentRevision: 0, baseSourceRevision: 0,
            changes: [.updateImage(imageId: second.id, caption: "Revised second chart",
                needsReview: nil, anchorAt: nil, timeKnown: nil, blockText: "Revised second chart")])
        #expect(try recovery.apply(edit).status == .applied)
        let reopened = try MeetingStore(root: root)
        let final = try reopened.load(id: captured.id)
        #expect(final.images?.map(\.dataUrl) == captured.images?.map(\.dataUrl))
        #expect(final.images?.last?.caption == "Revised second chart")
        #expect(final.notes?.blocks?.last?.text == "Revised second chart")
        #expect(MeetingLibrarySearch.searchRecords(reopened.libraryRecords(), query: "Revised second chart").first?.kind == "moment")
        #expect(MeetingLibrarySearch.searchRecords(reopened.libraryRecords(), query: "angela").first?.kind == "transcript")
    }

    @Test func `library rename returns a small row and preserves full images`() async throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-rename-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let original = fixture()
        try store.save(original)
        let bridge = NotesBridge(store: store,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!))
        let response = try #require(try await bridge.dispatch("renameMeeting",
            arguments: [original.id, "Renamed from library"]) as? String)
        let entry = try JSONDecoder.excerpt.decode(MeetingLibraryEntry.self, from: Data(response.utf8))
        #expect(entry.title == "Renamed from library")
        #expect(!response.contains("data:image"))
        #expect(!response.contains("launch transcript"))
        #expect(try store.load(id: original.id).images == original.images)
    }

    @Test func `missing asset is reported as unreadable rather than missing`() async throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-unreadable-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let original = fixture()
        try store.save(original)
        let asset = try #require(FileManager.default.contentsOfDirectory(
            at: root.appending(path: "meeting-assets/library"), includingPropertiesForKeys: nil).first)
        try FileManager.default.removeItem(at: asset)
        let cold = try MeetingStore(root: root)
        let bridge = NotesBridge(store: cold,
            preferences: PreferencesStore(defaults: UserDefaults(suiteName: UUID().uuidString)!))
        #expect(try await bridge.dispatch("loadMeeting", arguments: ["not-here"]) == nil)
        await #expect(throws: Error.self) { try await bridge.dispatch("loadMeeting", arguments: [original.id]) }
    }

    @Test func `transcript correction restores omitted existing image bytes`() throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-correction-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let original = fixture()
        try store.save(original)
        var corrected = original.events
        corrected[0].text = "Ask Ángela for the corrected launch plan."
        var omitted = original.images![0]
        omitted.dataUrl = ""
        let mutation = MeetingMutation(operationId: UUID().uuidString, meetingId: original.id,
            baseRevision: 0, baseDocumentRevision: 0, baseSourceRevision: 0,
            changes: [.correctTranscript(events: corrected, items: original.items,
                document: original.notes, suggestedNotes: nil, images: [omitted], sourceRevision: 1)])
        let ack = try store.apply(mutation)
        #expect(ack.status == .applied)
        #expect(ack.meeting.images == original.images)
        #expect(try MeetingStore(root: root).load(id: original.id).images == original.images)
    }
}
