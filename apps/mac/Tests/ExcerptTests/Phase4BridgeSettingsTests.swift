import Foundation
import Testing
@testable import Excerpt

@MainActor
struct Phase4BridgeSettingsTests {
    private func defaults() -> UserDefaults {
        UserDefaults(suiteName: "excerpt-phase4-bridge-\(UUID().uuidString)")!
    }

    @Test func `caption patches cross the real bridge and persist every user field`() async throws {
        let directory = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-settings-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let defaults = defaults()
        let overlay = OverlayController(defaults: defaults, availableDisplays: { [.init(id: "a", name: "Display A")] }, mainDisplayID: { "a" })
        let microphone = MicrophoneController(defaults: defaults, discovery: Phase4Discovery())
        let bridge = NotesBridge(store: try MeetingStore(root: directory), preferences: PreferencesStore(defaults: defaults),
            desktopSettings: { DesktopSettings(captions: overlay.settings(), microphone: microphone.snapshot(), shortcuts: []) },
            saveCaptionSettings: { overlay.apply($0.applying(to: overlay.settings())) },
            selectMicrophone: { try microphone.select($0) })
        var broadcasts = 0
        bridge.onDesktopSettingsChange = { _ in broadcasts += 1 }
        #expect(overlay.preset == .classic)
        #expect(overlay.captionsEnabled)
        // The former decoder required display metadata that TypeScript never sent.
        _ = try await bridge.dispatch("saveCaptionSettings", arguments: [#"{"preset":"warm"}"#])
        overlay.setPosition(.higher) // an independent menu edit must survive the next editor patch
        _ = try await bridge.dispatch("saveCaptionSettings", arguments: [#"{"size":"large","enabled":false,"displayId":"b"}"#])
        #expect(overlay.position == .higher)
        #expect(overlay.preset == .warm)
        #expect(broadcasts == 2)
        let reloaded = OverlayController(defaults: defaults, availableDisplays: { [.init(id: "a", name: "Display A")] }, mainDisplayID: { "a" })
        #expect(reloaded.preset == .warm && reloaded.size == .large && reloaded.position == .higher)
        #expect(!reloaded.captionsEnabled && reloaded.selectedDisplayID == "b")
        let json = try #require(try await bridge.dispatch("loadDesktopSettings") as? String)
        let snapshot = try JSONDecoder().decode(DesktopSettings.self, from: Data(json.utf8))
        #expect(snapshot.captions == overlay.settings())
        await #expect(throws: (any Error).self) {
            _ = try await bridge.dispatch("saveCaptionSettings", arguments: [#"{"preset":"invented"}"#])
        }
        #expect(overlay.preset == .warm)
        _ = try await bridge.dispatch("selectMicrophone", arguments: ["usb"])
        #expect(microphone.selectedDeviceID == "usb")
    }

    @Test func `library and other starts share one coordinator without forcing notes open`() async throws {
        let directory = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-commands-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let gate = Phase4Gate()
        var active = false, starts = 0, returnedFocus = 0, openedNotes = 0
        let commands = MeetingCommandCoordinator(isActive: { active }, start: {
            starts += 1
            await gate.wait()
            active = true
            return true
        }, stop: { active = false }, didStart: { returnedFocus += 1 })
        let bridge = NotesBridge(store: try MeetingStore(root: directory), preferences: PreferencesStore(defaults: defaults()),
            startMeeting: { try await commands.start() }, openLiveNotes: { openedNotes += 1 })
        let first = Task { try await bridge.dispatch("startMeeting") }
        await gate.waitUntilEntered()
        let duplicate = Task { try await commands.start() }
        await gate.open()
        _ = try await first.value
        try await duplicate.value
        #expect(starts == 1 && returnedFocus == 1 && openedNotes == 0)
        _ = try await bridge.dispatch("openLiveNotes")
        #expect(openedNotes == 1)
        await commands.end()
        #expect(!active)
    }

}
