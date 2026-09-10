import AppKit
import SwiftUI

final class SpikeAppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory, not regular. A regular app owns a Space and is switched away
        // from when another app goes fullscreen, so its overlay disappears exactly
        // when a meeting needs it. Measured, and it matches the product's menu-bar
        // architecture anyway.
        NSApp.setActivationPolicy(.accessory)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Excerpt — Stage 0 gate"
        window.center()
        window.contentView = NSHostingView(rootView: SpikeView())
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
