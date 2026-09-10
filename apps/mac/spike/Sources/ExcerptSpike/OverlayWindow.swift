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
            case .screenSaver: return .screenSaver
            case .maximum: return NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.maximumWindow)))
            case .popUpMenu: return .popUpMenu
            }
        }
    }

    init(screen: NSScreen, elevation: Elevation = .maximum) {
        super.init(
            contentRect: OverlayWindow.frame(for: screen),
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

    /// The lower third, full width, matching where film subtitles sit.
    static func frame(for screen: NSScreen) -> NSRect {
        let visible = screen.frame
        let height: CGFloat = 220
        return NSRect(
            x: visible.minX,
            y: visible.minY + visible.height * 0.10,
            width: visible.width,
            height: height
        )
    }

    func reposition(to screen: NSScreen) {
        setFrame(OverlayWindow.frame(for: screen), display: true)
    }
}

/// Owns the overlay window and the text it shows.
@MainActor
final class OverlayController: ObservableObject {
    @Published var caption: CaptionLine?
    @Published var visible = false
    @Published var screenName = "—"

    private var window: OverlayWindow?
    private var screenObserver: NSObjectProtocol?
    @Published var elevation: OverlayWindow.Elevation = .maximum
    /// Measured: the overlay only appears over fullscreen apps in accessory mode.
    @Published var accessoryMode = true

    struct CaptionLine: Equatable {
        var speaker: String
        var text: String
    }

    /// A regular app lives in the desktop Space and is switched away from when another
    /// app goes fullscreen — .fullScreenAuxiliary is really for the fullscreen app's
    /// own windows. An accessory (menu-bar) app has no Space of its own, so its
    /// canJoinAllSpaces windows float over everything. The product is a menu-bar app,
    /// so this is the target configuration, not a workaround.
    func setAccessoryMode(_ on: Bool) {
        accessoryMode = on
        NSApp.setActivationPolicy(on ? .accessory : .regular)
        if on { NSApp.activate(ignoringOtherApps: false) }
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

    func show(on screen: NSScreen? = nil) {
        let target = screen ?? NSScreen.main ?? NSScreen.screens.first!
        if window == nil {
            let window = OverlayWindow(screen: target, elevation: elevation)
            window.contentView = NSHostingView(rootView: CaptionOverlayView(controller: self))
            self.window = window
        }
        window?.reposition(to: target)
        window?.orderFrontRegardless()
        visible = true
        screenName = target.localizedName

        // Gate 11: follow display changes rather than being stranded on a screen
        // that no longer exists.
        if screenObserver == nil {
            screenObserver = NotificationCenter.default.addObserver(
                forName: NSApplication.didChangeScreenParametersNotification,
                object: nil, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    guard let self, let window = self.window else { return }
                    let screen = NSScreen.main ?? NSScreen.screens.first!
                    window.reposition(to: screen)
                    self.screenName = screen.localizedName
                }
            }
        }
    }

    func hide() {
        window?.orderOut(nil)
        visible = false
    }

    /// Move to the screen the pointer is on, so it follows the meeting.
    func followPointer() {
        let point = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(point, $0.frame, false) }) else { return }
        window?.reposition(to: screen)
        screenName = screen.localizedName
    }

    func update(speaker: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        caption = trimmed.isEmpty ? nil : CaptionLine(speaker: speaker, text: trimmed)
    }
}
