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
    private(set) var screenName = "—"

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
    }

    private enum Key {
        static let preset = "caption.preset"
        static let size = "caption.size"
        static let position = "caption.position"
    }

    init(defaults: UserDefaults = .standard) {
        // A look is a preference, not data: if it fails to load we show the default
        // rather than complaining about it.
        self.defaults = defaults
        preset = defaults.string(forKey: Key.preset).flatMap(CaptionPreset.init) ?? .classic
        size = defaults.string(forKey: Key.size).flatMap(CaptionSize.init) ?? .medium
        position = defaults.string(forKey: Key.position).flatMap(CaptionPosition.init) ?? .standard
    }

    private let defaults: UserDefaults

    // MARK: - Appearance

    /// Changing the look is instant and visible: the window already on screen re-renders
    /// from the new value, so the choice is judged against a live caption rather than
    /// against a swatch.
    func setPreset(_ value: CaptionPreset) {
        preset = value
        defaults.set(value.rawValue, forKey: Key.preset)
    }

    func setSize(_ value: CaptionSize) {
        size = value
        defaults.set(value.rawValue, forKey: Key.size)
    }

    func setPosition(_ value: CaptionPosition) {
        position = value
        defaults.set(value.rawValue, forKey: Key.position)
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

    /// The screen to show on, preferring the one the pointer is on — that is the one
    /// the meeting is on. Returns nil only if the Mac reports no screens at all, which
    /// happens with the lid shut and no display attached; showing nothing is correct then.
    private func targetScreen(preferring screen: NSScreen? = nil) -> NSScreen? {
        if let screen { return screen }
        let pointer = NSEvent.mouseLocation
        return NSScreen.screens.first { NSMouseInRect(pointer, $0.frame, false) }
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
                    guard let self, let window = self.window,
                          let screen = self.targetScreen() else { return }
                    window.reposition(to: screen)
                    self.screenName = screen.localizedName
                }
            }
        }
    }

    func hide() {
        window?.orderOut(nil)
        visible = false
        DockPresence.shared.overlay(isShowing: false)
    }

    func toggle() {
        if visible { hide() } else { show() }
    }

    /// Move to the screen the pointer is on, so it follows the meeting.
    func followPointer() {
        guard let screen = targetScreen() else { return }
        window?.reposition(to: screen)
        screenName = screen.localizedName
    }

    func update(speaker: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        caption = trimmed.isEmpty ? nil : CaptionLine(speaker: speaker, text: trimmed)
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
