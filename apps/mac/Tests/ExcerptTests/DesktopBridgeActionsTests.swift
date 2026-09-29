import Foundation
import Testing
@testable import Excerpt

@MainActor
struct DesktopBridgeActionsTests {
    @Test func `editor Start and Open live notes invoke typed native actions`() async throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-bridge-actions-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        var started = 0
        var opened = 0
        let bridge = NotesBridge(
            store: store, preferences: PreferencesStore(defaults: defaults),
            startMeeting: { _ in started += 1 }, openLiveNotes: { opened += 1 })

        try await bridge.performStartMeeting()
        bridge.performOpenLiveNotes()

        #expect(started == 1)
        #expect(opened == 1)
    }
}
