import AppKit
import AVFoundation
import CoreMedia
import Foundation
import Testing
@testable import Excerpt

@MainActor
struct Phase4DesktopSettingsTests {
    private func defaults() -> UserDefaults {
        UserDefaults(suiteName: "excerpt-phase4-\(UUID().uuidString)")!
    }


    @Test func `display choice is stable and survives disconnect and reconnect`() {
        var displays: [CaptionDisplay] = [.init(id: "a", name: "Built in"), .init(id: "b", name: "External")]
        var main = "a"
        let overlay = OverlayController(defaults: defaults(), availableDisplays: { displays }, mainDisplayID: { main })
        var changes = 0
        overlay.onSettingsChange = { changes += 1 }
        overlay.setDisplay("b")
        main = "a"
        #expect(overlay.resolvedDisplayID == "b")
        displays.removeLast()
        overlay.displaysDidChange()
        #expect(overlay.settings().displayMissing)
        #expect(overlay.selectedDisplayID == "b" && overlay.resolvedDisplayID == "a")
        displays.append(.init(id: "b", name: "External"))
        overlay.displaysDidChange()
        #expect(overlay.resolvedDisplayID == "b" && !overlay.settings().displayMissing)
        #expect(changes == 3)
        displays = []
        overlay.displaysDidChange()
        #expect(overlay.resolvedDisplayID == nil)
    }

    @Test func `selected microphone persists and missing input never silently falls back`() throws {
        let defaults = defaults()
        let discovery = Phase4Discovery()
        let microphone = MicrophoneController(defaults: defaults, discovery: discovery)
        try microphone.select("usb")
        let reloaded = MicrophoneController(defaults: defaults, discovery: discovery)
        #expect(try reloaded.selectedDeviceIDForCapture() == "usb")
        let configuration = CaptureEngine.configuration(microphoneID: try reloaded.selectedDeviceIDForCapture())
        #expect(configuration.microphoneCaptureDeviceID == "usb")
        #expect(configuration.captureMicrophone && configuration.capturesAudio)
        discovery.available = [.init(id: "built-in", name: "Built in")]
        reloaded.refresh()
        #expect(reloaded.snapshot().health == .missing)
        #expect(reloaded.selectedDeviceID == "usb")
        #expect(throws: MicrophoneSelectionError.self) { try reloaded.selectedDeviceIDForCapture() }
        discovery.available.append(.init(id: "usb", name: "USB"))
        reloaded.refresh()
        #expect(reloaded.snapshot(liveHealth: .silent).health == .silent)
        #expect(reloaded.snapshot(liveHealth: .hearing).health == .hearing)
        reloaded.selectionLocked = true
        #expect(throws: MicrophoneSelectionError.self) { try reloaded.select("built-in") }
        #expect(reloaded.snapshot().selectionLocked)
    }

    @Test func `first attached microphone becomes the initial selection only when none was saved`() throws {
        let discovery = Phase4Discovery()
        discovery.available = []
        let controller = MicrophoneController(defaults: defaults(), discovery: discovery)
        #expect(controller.snapshot().health == .missing)
        discovery.available = [.init(id: "usb", name: "USB")]
        controller.refresh()
        #expect(try controller.selectedDeviceIDForCapture() == "usb")
    }

    @Test func `shortcuts register once surface conflicts and release contextual keys`() {
        let menuItem = MeetingShortcuts.menuItem(title: "Start meeting", action: NSSelectorFromString("toggleListening"))
        #expect(menuItem.keyEquivalent.isEmpty)
        #expect(menuItem.action != nil)
        var registrations: [MeetingShortcutName] = []
        var releases: [MeetingShortcutName] = []
        let shortcuts = MeetingShortcuts(register: { name in registrations.append(name); return name != .captions }, unregister: { releases.append($0) })
        var starts = 0, captures = 0
        shortcuts.onMeeting = { starts += 1 }
        shortcuts.onScreenshot = { captures += 1 }
        shortcuts.registerCore()
        shortcuts.registerCore()
        #expect(registrations.filter { $0 == .meeting }.count == 1)
        #expect(shortcuts.statuses().first { $0.name == .captions }?.registered == false)
        shortcuts.perform(.meeting)
        shortcuts.perform(.capture)
        #expect(starts == 1 && captures == 0)
        shortcuts.setMeetingActive(true)
        shortcuts.setMeetingActive(true)
        shortcuts.perform(.capture)
        #expect(captures == 1)
        #expect(registrations.filter { $0 == .capture }.count == 1)
        shortcuts.setMeetingActive(false)
        shortcuts.perform(.capture)
        #expect(captures == 1 && releases.contains(.capture) && releases.contains(.catchUp))
        shortcuts.unregister()
        #expect(shortcuts.statuses().allSatisfy { !$0.registered })
    }


    @Test func `ending during startup cancels capture and never returns focus late`() async throws {
        let gate = Phase4Gate()
        var active = false, focus = 0, stopped = 0
        let commands = MeetingCommandCoordinator(isActive: { active }, start: {
            active = true
            await gate.wait()
            try Task.checkCancellation()
            return true
        }, stop: { stopped += 1; active = false; await gate.open() }, didStart: { focus += 1 })
        let start = Task { try await commands.start() }
        await gate.waitUntilEntered()
        await commands.end()
        do { try await start.value; Issue.record("Cancelled start unexpectedly succeeded") }
        catch { #expect(error is CancellationError) }
        #expect(!active && stopped == 1 && focus == 0)
    }

    @Test func `coordinator preserves useful permission and device failure messages`() async {
        let commands = MeetingCommandCoordinator(isActive: { false }, start: { throw MicrophoneSelectionError.missing("USB") }, stop: {})
        do { try await commands.start(); Issue.record("Missing input unexpectedly started") }
        catch { #expect(error.localizedDescription.contains("USB")) }
    }

    @Test func `input check uses selected capture input shows both meters and releases it`() async throws {
        let microphone = MicrophoneController(defaults: defaults(), discovery: Phase4Discovery())
        try microphone.select("usb")
        let capture = Phase4Capture()
        var selected = ""
        let check = InputCheck(microphone: microphone, makeCapture: { selected = $0; return capture })
        await check.start()
        #expect(selected == "usb" && check.running && microphone.selectionLocked)
        capture.stats = [.microphone: SourceStats(buffers: 2, level: 0.1), .system: SourceStats(buffers: 2, level: 0)]
        check.sample()
        #expect(check.microphoneMessage.contains("sound detected"))
        #expect(check.systemMessage.contains("quiet"))
        #expect(check.microphoneLevel > 0 && check.systemLevel == 0)
        await check.stop()
        #expect(capture.stops == 1 && !check.running && !microphone.selectionLocked)
    }

    @Test func `input check failure and closing during startup clean up without late restart`() async {
        let microphone = MicrophoneController(defaults: defaults(), discovery: Phase4Discovery())
        let capture = Phase4Capture()
        capture.failure = true
        let check = InputCheck(microphone: microphone, makeCapture: { _ in capture })
        await check.start()
        #expect(check.error != nil && !check.running && !microphone.selectionLocked)
        let gate = Phase4Gate()
        let slow = Phase4Capture()
        slow.gate = gate
        let pending = InputCheck(microphone: microphone, makeCapture: { _ in slow })
        let task = Task { await pending.start() }
        await gate.waitUntilEntered()
        await pending.stop()
        await task.value
        #expect(!pending.running && !microphone.selectionLocked)
        #expect(slow.stops >= 1)
    }
}

final class Phase4Discovery: MicrophoneDiscovering, @unchecked Sendable {
    var available: [MicrophoneDevice] = [.init(id: "built-in", name: "Built in"), .init(id: "usb", name: "USB")]
    func devices() -> [MicrophoneDevice] { available }
    func defaultDeviceID() -> String? { available.first?.id }
}

actor Phase4Gate {
    private var entered = false, opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var entering: [CheckedContinuation<Void, Never>] = []
    func wait() async {
        entered = true
        entering.forEach { $0.resume() }; entering = []
        if !opened { await withCheckedContinuation { waiters.append($0) } }
    }
    func waitUntilEntered() async {
        if !entered { await withCheckedContinuation { entering.append($0) } }
    }
    func open() {
        opened = true
        waiters.forEach { $0.resume() }; waiters = []
    }
}

private final class Phase4Capture: MeetingCapturing {
    var stats: [SourceKind: SourceStats] = [:]
    var stops = 0
    var failure = false
    var gate: Phase4Gate?
    func statistics() -> [SourceKind: SourceStats] { stats }
    func start(onBuffer: @escaping (SourceKind, AVAudioPCMBuffer, CMTime) -> Void, onStreamError: @escaping (String) -> Void) async throws {
        if let gate { await gate.wait() }
        if failure { throw MicrophoneSelectionError.unavailable }
    }
    func stop() async { stops += 1; await gate?.open() }
}
