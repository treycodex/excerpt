import AppKit
import SwiftUI

/// Motif 1, natively: text directly over the meeting. No panel, no background, no
/// controls — the thing a web page fundamentally cannot draw.
final class OverlayWindow: NSWindow {

    /// Window level, adjustable because "above a fullscreen app" is not one setting.
    enum Elevation: String, CaseIterable {
        case screenSaver, maximum, popUpMenu

        var level: NSWindow.Level {
            switch self {
            case .screenSaver: .screenSaver
            case .maximum: NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)))
            case .popUpMenu: .popUpMenu
            }
        }
    }

    init(screen: NSScreen, elevation: Elevation = .maximum) {
        super.init(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        isMovableByWindowBackground = false
        ignoresMouseEvents = true          // gate 10: clicks reach the meeting
        hidesOnDeactivate = false

        // The caption owns its own fade, at the token's duration and curve. AppKit's
        // window fade would run on top of it and arrive late.
        animationBehavior = .none

        // Deliberately left capturable (`sharingType` stays `.readOnly`). Excluding the
        // overlay from capture would keep captions out of a screen you share — but it
        // also makes them vanish from screen recordings and from the user's own
        // screenshots, silently, which is how a demo of this app ends up showing no
        // captions at all. Measured: with `.none`, `screencapture` returned a bare
        // desktop. Visible everywhere beats tidy in one place.

        // Above normal windows and above a fullscreen app's own content.
        level = elevation.level

        // canJoinAllSpaces + fullScreenAuxiliary is what lets a window sit over a
        // fullscreen meeting instead of being banished to its own Space.
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]

        // Never steal focus from the meeting.
        styleMask.remove(.titled)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    /// The whole screen. The caption places itself inside it at the token's height,
    /// so "how far up the picture the subtitle sits" is one number shared with the
    /// web rather than a window inset invented here.
    func reposition(to screen: NSScreen) {
        setFrame(screen.frame, display: true)
    }
}

/// Owns the overlay window, the text it shows, and how it looks.
@MainActor
@Observable
final class OverlayController {
    var caption: CaptionLine?
    private(set) var visible = false
    /// The user's durable choice. `visible` is only the current window state and is
    /// cleared at the end of every meeting so Dock presence remains truthful.
    private(set) var captionsEnabled: Bool
    private(set) var screenName = "—"
    private(set) var selectedDisplayID: String
    @ObservationIgnored var onSettingsChange: (() -> Void)?

    /// Recognition revisions remain off screen until the next presentation boundary.
    @ObservationIgnored private var presentation = SubtitlePresentation()
    @ObservationIgnored private var presentationTask: Task<Void, Never>?

    private(set) var preset: CaptionPreset
    private(set) var size: CaptionSize
    private(set) var position: CaptionPosition

    private var window: OverlayWindow?
    private var screenObserver: ScreenObserver?
    private(set) var elevation: OverlayWindow.Elevation = .maximum
    /// Measured: the overlay only appears over fullscreen apps in accessory mode.
    private(set) var accessoryMode = true

    struct CaptionLine: Equatable {
        var speaker: String
        var text: String
        /// Already broken. The view draws these and measures nothing, because line
        /// breaking is a judgement about the words and belongs with the words — not a
        /// measurement repeated on every frame while someone is still talking.
        var lines: [String]
    }

    /// How text becomes at most two lines. Assigned by `AppDelegate` to the shared
    /// engine's `subtitleLines`, so a caption breaks in the same place on the Mac as it
    /// does on the website.
    ///
    /// The default is a plain character-greedy tail, and it is not defensive padding:
    /// the overlay is built before `CoreEngine` and outlives its failure, so this is
    /// what keeps captions on screen when the notes engine is missing entirely.
    @ObservationIgnored var breakLines: @MainActor (String) -> [String] = OverlayController.fallbackLines

    private enum Key {
        static let preset = "caption.preset"
        static let size = "caption.size"
        static let position = "caption.position"
        static let enabled = "caption.enabled"
        static let display = "caption.display-id"
    }

    init(defaults: UserDefaults = .standard) {
        // A look is a preference, not data: if it fails to load we show the default
        // rather than complaining about it.
        self.defaults = defaults
        preset = defaults.string(forKey: Key.preset).flatMap(CaptionPreset.init) ?? .classic
        size = defaults.string(forKey: Key.size).flatMap(CaptionSize.init) ?? .medium
        position = defaults.string(forKey: Key.position).flatMap(CaptionPosition.init) ?? .standard
        captionsEnabled = defaults.object(forKey: Key.enabled) == nil
            ? true
            : defaults.bool(forKey: Key.enabled)
        selectedDisplayID = defaults.string(forKey: Key.display)
            ?? NSScreen.main.map(Self.displayID) ?? NSScreen.screens.first.map(Self.displayID) ?? ""
        if defaults.string(forKey: Key.display) == nil, !selectedDisplayID.isEmpty {
            defaults.set(selectedDisplayID, forKey: Key.display)
        }
    }

    private let defaults: UserDefaults

    // MARK: - Appearance

    /// Changing the look is instant and visible: the window already on screen re-renders
    /// from the new value, so the choice is judged against a live caption rather than
    /// against a swatch.
    func setPreset(_ value: CaptionPreset) {
        preset = value
        defaults.set(value.rawValue, forKey: Key.preset)
        onSettingsChange?()
    }

    func setSize(_ value: CaptionSize) {
        size = value
        defaults.set(value.rawValue, forKey: Key.size)
        onSettingsChange?()
    }

    func setPosition(_ value: CaptionPosition) {
        position = value
        defaults.set(value.rawValue, forKey: Key.position)
        onSettingsChange?()
    }

    func setCaptionsEnabled(_ enabled: Bool) {
        captionsEnabled = enabled
        defaults.set(enabled, forKey: Key.enabled)
        onSettingsChange?()
    }

    static func displayID(_ screen: NSScreen) -> String {
        if let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
            return number.stringValue
        }
        // The numeric display id is present on supported macOS releases. Keep a
        // deterministic fallback for tests and unusual virtual displays.
        return "screen:\(screen.localizedName):\(Int(screen.frame.minX)):\(Int(screen.frame.minY))"
    }

    var displays: [CaptionDisplay] {
        NSScreen.screens.map { CaptionDisplay(id: Self.displayID($0), name: $0.localizedName) }
    }

    var displayMissing: Bool {
        !selectedDisplayID.isEmpty && !NSScreen.screens.contains { Self.displayID($0) == selectedDisplayID }
    }

    func settings() -> CaptionSettings {
        let connected = displays
        let chosen = connected.first(where: { $0.id == selectedDisplayID })
        return CaptionSettings(
            preset: preset, size: size, position: position, enabled: captionsEnabled,
            displayId: selectedDisplayID, displays: connected,
            displayMissing: chosen == nil,
            displayName: chosen?.name ?? (selectedDisplayID.isEmpty ? "No display" : "Disconnected display"))
    }

    func apply(_ settings: CaptionSettings) {
        preset = settings.preset
        size = settings.size
        position = settings.position
        captionsEnabled = settings.enabled
        selectedDisplayID = settings.displayId
        defaults.set(preset.rawValue, forKey: Key.preset)
        defaults.set(size.rawValue, forKey: Key.size)
        defaults.set(position.rawValue, forKey: Key.position)
        defaults.set(captionsEnabled, forKey: Key.enabled)
        defaults.set(selectedDisplayID, forKey: Key.display)
        if visible {
            if let target = targetScreen() {
                window?.reposition(to: target)
                screenName = target.localizedName
            } else { hide() }
        }
        onSettingsChange?()
    }

    func setDisplay(_ id: String) {
        selectedDisplayID = id
        defaults.set(id, forKey: Key.display)
        if visible, let target = targetScreen() {
            window?.reposition(to: target)
            screenName = target.localizedName
        }
        onSettingsChange?()
    }

    // MARK: - Window

    /// A regular app lives in the desktop Space and is switched away from when another
    /// app goes fullscreen — .fullScreenAuxiliary is really for the fullscreen app's
    /// own windows. An accessory (menu-bar) app has no Space of its own, so its
    /// canJoinAllSpaces windows float over everything. The product is a menu-bar app,
    /// so this is the target configuration, not a workaround.
    func setAccessoryMode(_ on: Bool) {
        accessoryMode = on
        // Pinned, not set: DockPresence owns the policy, and the diagnostics window is
        // the one caller allowed to overrule the rule while it measures each mode.
        DockPresence.shared.force(on ? .accessory : .regular)
        rebuild()
    }

    /// The overlay window carries the activation policy in its collection behaviour, so
    /// a policy change has to rebuild it. Called by DockPresence, which owns the policy.
    func policyDidChange() {
        rebuild()
    }

    func setElevation(_ value: OverlayWindow.Elevation) {
        elevation = value
        rebuild()
    }

    private func rebuild() {
        let wasVisible = visible
        window?.orderOut(nil)
        window = nil
        if wasVisible { show() }
    }

    /// The configured display is stable across fullscreen and focus changes. If it is
    /// disconnected we retain the preference but use the main display until it returns.
    private func targetScreen(preferring screen: NSScreen? = nil) -> NSScreen? {
        if let screen { return screen }
        return NSScreen.screens.first { Self.displayID($0) == selectedDisplayID }
            ?? NSScreen.main
            ?? NSScreen.screens.first
    }

    func show(on screen: NSScreen? = nil) {
        guard let target = targetScreen(preferring: screen) else { return }

        let window = window ?? {
            let created = OverlayWindow(screen: target, elevation: elevation)
            created.contentView = NSHostingView(rootView: CaptionOverlayView(controller: self))
            self.window = created
            return created
        }()

        window.reposition(to: target)
        window.orderFrontRegardless()
        visible = true
        screenName = target.localizedName
        DockPresence.shared.overlay(isShowing: true)
        // Resume the presentation clock, discarding speech that expired while hidden.
        startPresentationClock()

        // Gate 11: follow display changes rather than being stranded on a screen
        // that no longer exists.
        if screenObserver == nil {
            screenObserver = ScreenObserver(
                forName: NSApplication.didChangeScreenParametersNotification
            ) { [weak self] _ in
                // The queue is .main, so this already runs on the main thread. Hopping
                // through a Task would cost a frame or more before the overlay caught up
                // with a display that just moved.
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if let window = self.window, let screen = self.targetScreen() {
                        window.reposition(to: screen)
                        self.screenName = screen.localizedName
                    } else if self.visible {
                        self.hide()
                    }
                    self.onSettingsChange?()
                }
            }
        }
    }

    func hide() {
        window?.orderOut(nil)
        visible = false
        presentationTask?.cancel()
        presentationTask = nil
        DockPresence.shared.overlay(isShowing: false)
    }

    func toggle() {
        if visible { hide() } else { show() }
    }

    /// Move to the screen the pointer is on, so it follows the meeting.
    func followPointer() {
        let pointer = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(pointer, $0.frame, false) })
            ?? NSScreen.main else { return }
        setDisplay(Self.displayID(screen))
        window?.reposition(to: screen)
        screenName = screen.localizedName
    }

    func update(speaker: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            presentation = SubtitlePresentation()
            presentationTask?.cancel()
            presentationTask = nil
            if caption != nil { caption = nil }
            return
        }
        presentation.receive(speaker: speaker, text: trimmed, at: ProcessInfo.processInfo.systemUptime)

        // Off screen, the words are worth keeping but breaking them is not: `show()`
        // breaks whatever is held. This is what lets the session push unconditionally
        // and stop caring whether the overlay is up.
        guard visible else { return }

        startPresentationClock()
    }

    /// Only run while a cue is waiting or visible. The timer updates presentation,
    /// never the recognition stream or stored transcript.
    private func startPresentationClock() {
        guard visible, presentationTask == nil else { return }
        // Tick immediately on showing the window: expired speech stays expired.
        presentTick()
        guard presentation.needsTick else { return }
        presentationTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard let self, self.visible else { return }
                self.presentTick()
                if !self.presentation.needsTick {
                    self.presentationTask = nil
                    return
                }
            }
        }
    }

    private func presentTick() {
        presentation.tick(at: ProcessInfo.processInfo.systemUptime)
        guard let cue = presentation.displayed else {
            if caption != nil { caption = nil }
            return
        }
        guard caption?.speaker != cue.speaker || caption?.text != cue.text else { return }
        caption = CaptionLine(speaker: cue.speaker, text: cue.text, lines: breakLines(cue.text))
    }

    /// At most two lines, keeping the tail, splitting on spaces at the token's budget.
    ///
    /// Deliberately simpler than the shared engine's phrase breaker — it exists for the
    /// case where that engine could not be loaded, and a caption broken in a slightly
    /// worse place is enormously better than no caption.
    nonisolated static func fallbackLines(_ text: String) -> [String] {
        let budget = CaptionTokens.maxCharsPerLine
        var lines: [String] = []
        var current = ""
        for word in text.split(separator: " ", omittingEmptySubsequences: true) {
            let candidate = current.isEmpty ? String(word) : current + " " + word
            if current.isEmpty || candidate.count <= budget {
                current = candidate
            } else {
                lines.append(current)
                current = String(word)
            }
        }
        if !current.isEmpty { lines.append(current) }
        return Array(lines.suffix(CaptionTokens.maxLines))
    }
}


/// Owns one notification registration and removes it when it is released.
///
/// A `deinit` on a `@MainActor` class is nonisolated and so cannot touch the isolated
/// property holding the token. Letting the token own its own removal sidesteps that
/// entirely — no `nonisolated(unsafe)`, and the controller needs no `deinit` at all.
private final class ScreenObserver {
    private let token: NSObjectProtocol

    init(forName name: Notification.Name, handler: @escaping @Sendable (Notification) -> Void) {
        token = NotificationCenter.default.addObserver(
            forName: name, object: nil, queue: .main, using: handler
        )
    }

    deinit { NotificationCenter.default.removeObserver(token) }
}
