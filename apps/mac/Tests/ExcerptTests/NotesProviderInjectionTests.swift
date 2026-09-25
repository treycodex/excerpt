import Foundation
import Testing
@testable import Excerpt

@MainActor
struct NotesProviderInjectionTests {
    private struct FixtureProvider: NotesProviding {
        let providerID = "fixture"
        let modelID = "fixture-model"

        func summarize(_ meeting: Meeting, request: NotesGenerationRequest) async throws -> NotesDocument {
            NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
                NoteBlock(id: "fixture-note", kind: "paragraph", text: "Synthetic provider result", evidence: [])
            ])
        }
    }

    @Test func `provider work can be injected without keychain or model availability`() async throws {
        let meeting = Meeting(id: "provider-fixture", title: "Synthetic", startedAt: "2026-09-01T09:00:00Z",
                              processing: .onDevice, events: [], items: [])
        let result = try await NotesProviderCoordinator.summarize(
            meeting, preferences: .default, request: NotesGenerationRequest(style: "balanced"),
            provider: FixtureProvider())
        #expect(result.blocks?.map(\.text) == ["Synthetic provider result"])
    }
}
