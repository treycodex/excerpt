import Foundation
import Testing
@testable import Excerpt

/// Shared synthetic meeting data protects old local files while the browser product
/// is removed. It is decoded by the same Swift models and written through the same
/// isolated store used for real meetings; no user Application Support data is read.
@MainActor
struct DesktopMeetingFixturesTests {
    private struct Fixtures: Decodable {
        struct Fixture: Decodable {
            var name: String
            var state: String
            var meeting: Meeting
        }
        var version: Int
        var meetings: [Fixture]
    }

    private static var repoRoot: URL {
        URL(filePath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private static func loadFixtures() throws -> Fixtures {
        try JSONDecoder.excerpt.decode(
            Fixtures.self,
            from: Data(contentsOf: repoRoot.appending(path: "packages/core/fixtures/desktop-meetings.json")))
    }

    @Test func `shared desktop fixtures decode through native legacy models`() throws {
        let fixtures = try Self.loadFixtures()
        #expect(fixtures.version == 1)
        #expect(Set(fixtures.meetings.map(\.name)) == [
            "text-only-finished", "screenshot-only-finished", "handwritten-finished",
            "corrected-finished", "reviewed-finished", "deleted-blocks-finished",
            "legacy-sections-finished", "interrupted-draft",
        ])

        let legacy = try #require(fixtures.meetings.first { $0.name == "legacy-sections-finished" })
        #expect(legacy.meeting.notes?.blocks == nil)
        #expect(legacy.meeting.processing == .cloud)
        let reviewed = try #require(fixtures.meetings.first { $0.name == "reviewed-finished" })
        #expect(reviewed.meeting.processing == .demo)
        let corrected = try #require(fixtures.meetings.first { $0.name == "corrected-finished" })
        #expect(corrected.meeting.events.first?.corrections?.count == 1)
        let draft = try #require(fixtures.meetings.first { $0.name == "interrupted-draft" })
        #expect(draft.meeting.endedAt == nil)
        #expect(draft.meeting.draftRevision == 4)
    }

    @Test func `finished fixtures and interrupted drafts round trip through isolated native storage`() throws {
        let fixtures = try Self.loadFixtures()
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-fixtures-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)

        for fixture in fixtures.meetings {
            if fixture.state == "draft" {
                try store.checkpointDraft(fixture.meeting)
                #expect(store.recoverDraft(id: fixture.meeting.id) == fixture.meeting.revisioned())
            } else {
                try store.save(fixture.meeting)
                #expect(try store.load(id: fixture.meeting.id) == fixture.meeting.revisioned())
            }
        }
        #expect(store.list().count == 7)
    }
}
