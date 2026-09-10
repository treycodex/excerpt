import AppKit
import SwiftUI

final class SpikeAppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var statusItem: NSStatusItem?
    private let overlayBridge = OverlayBridge.shared

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory, not regular. A regular app owns a Space and is switched away
        // from when another app goes fullscreen, so its overlay disappears exactly
        // when a meeting needs it. Measured, and it matches the product's menu-bar
        // architecture anyway.
        //
        // The cost is the Dock icon: an accessory app has none, so the menu bar is
        // the only way back to the app. That is not a workaround for the spike, it
        // is how the product is meant to work.
        NSApp.setActivationPolicy(.accessory)

        makeStatusItem()
        makeWindow()
    }

    private func makeStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            // A strip of ticks with one settled mark — the Strip motif at 16pt.
            button.image = NSImage(systemSymbolName: "captions.bubble", accessibilityDescription: "Excerpt")
            button.image?.isTemplate = true
        }

        let menu = NSMenu()
        menu.addItem(withTitle: "Gate window", action: #selector(showWindow), keyEquivalent: "").target = self
        menu.addItem(.separator())
        let toggle = NSMenuItem(title: "Show captions", action: #selector(toggleOverlay), keyEquivalent: "")
        toggle.target = self
        menu.addItem(toggle)
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Excerpt Spike", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    private func makeWindow() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Excerpt — Stage 0 gate"
        window.center()
        window.contentView = NSHostingView(rootView: SpikeView())
        window.isReleasedWhenClosed = false      // reopen from the menu bar
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func showWindow() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func toggleOverlay() {
        overlayBridge.toggle?()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

/// Lets the menu bar reach the overlay owned by the SwiftUI view tree.
final class OverlayBridge {
    static let shared = OverlayBridge()
    var toggle: (() -> Void)?
}
