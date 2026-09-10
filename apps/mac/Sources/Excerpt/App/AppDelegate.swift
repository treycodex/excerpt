import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var statusItem: NSStatusItem?
    private var showCaptionsItem: NSMenuItem?
    private var lookMenu: NSMenu?

    private var overlay: OverlayController? { OverlayBridge.shared.controller }

    /// Before the first frame, not after. Demoting to accessory in
    /// applicationDidFinishLaunching puts a Dock icon on screen for a moment and then
    /// takes it away, which reads as a glitch in an app whose whole point is that it
    /// is not in the way.
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory, not regular. A regular app owns a Space and is switched
        // away from when another app goes fullscreen, so its overlay disappears exactly
        // when a meeting needs it. Measured, and it matches the product's menu-bar
        // architecture anyway.
        //
        // The cost is the Dock icon: an accessory app has none, so the menu bar is the
        // only way back to the app. That is not a workaround, it is how the product is
        // meant to work — which is why the menu below has to answer "where am I, what
        // can I do, how do I get out" on its own.
        makeStatusItem()
        makeWindow()
    }

    // MARK: - Menu bar

    private func makeStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = Self.symbol("captions.bubble", "Excerpt")
        item.menu = makeMenu()
        statusItem = item
    }

    private static func symbol(_ name: String, _ description: String) -> NSImage? {
        let image = NSImage(systemSymbolName: name, accessibilityDescription: description)
        image?.isTemplate = true
        return image
    }

    private func makeMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self

        // Show captions is the one thing this app does; it goes first, with a shortcut,
        // and it carries its own state as a checkmark rather than a changing title.
        let captions = NSMenuItem(title: "Show captions over my meeting",
                                  action: #selector(toggleOverlay), keyEquivalent: "c")
        captions.keyEquivalentModifierMask = [.command, .shift]
        captions.target = self
        captions.image = Self.symbol("captions.bubble", "Show captions")
        menu.addItem(captions)
        showCaptionsItem = captions

        // The look, one level deeper: the common path is on, the choice is behind it.
        let look = NSMenuItem(title: "Caption look", action: nil, keyEquivalent: "")
        look.image = Self.symbol("textformat.size", "Caption look")
        let lookMenu = NSMenu()
        for preset in CaptionPreset.allCases {
            let entry = NSMenuItem(title: preset.title, action: #selector(choosePreset(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = preset.rawValue
            entry.image = Self.symbol(preset.symbol, preset.title)
            entry.toolTip = preset.explanation
            lookMenu.addItem(entry)
        }
        lookMenu.addItem(.separator())
        lookMenu.addItem(submenu(title: "Size", items: CaptionSize.allCases.map { ($0.title, $0.rawValue) },
                                 action: #selector(chooseSize(_:)), symbol: "textformat.size.larger"))
        lookMenu.addItem(submenu(title: "Position", items: CaptionPosition.allCases.map { ($0.title, $0.rawValue) },
                                 action: #selector(choosePosition(_:)), symbol: "arrow.up.and.down"))
        look.submenu = lookMenu
        menu.addItem(look)
        self.lookMenu = lookMenu

        menu.addItem(.separator())

        // With no Dock icon this is the only way back into the app, so it is named for
        // where it goes rather than for what it does to a window.
        let gate = NSMenuItem(title: "Open Excerpt", action: #selector(showWindow), keyEquivalent: "0")
        gate.keyEquivalentModifierMask = [.command]
        gate.target = self
        gate.image = Self.symbol("macwindow", "Open Excerpt")
        menu.addItem(gate)

        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Excerpt",
                     action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        return menu
    }

    private func submenu(title: String, items: [(String, String)], action: Selector, symbol: String) -> NSMenuItem {
        let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        parent.image = Self.symbol(symbol, title)
        let menu = NSMenu()
        for (label, value) in items {
            let entry = NSMenuItem(title: label, action: action, keyEquivalent: "")
            entry.target = self
            entry.representedObject = value
            menu.addItem(entry)
        }
        parent.submenu = menu
        return parent
    }

    // MARK: - Actions

    @objc private func showWindow() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func toggleOverlay() {
        overlay?.toggle()
        refreshStatusItem()
    }

    @objc private func choosePreset(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let preset = CaptionPreset(rawValue: raw) else { return }
        overlay?.setPreset(preset)
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let size = CaptionSize(rawValue: raw) else { return }
        overlay?.setSize(size)
    }

    @objc private func choosePosition(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let position = CaptionPosition(rawValue: raw) else { return }
        overlay?.setPosition(position)
    }

    // MARK: - State

    /// The icon says whether captions are on, so the answer is visible without opening
    /// anything — the menu bar is the whole of this app's chrome.
    private func refreshStatusItem() {
        let on = overlay?.visible ?? false
        statusItem?.button?.image = Self.symbol(on ? "captions.bubble.fill" : "captions.bubble", "Excerpt")
        showCaptionsItem?.state = on ? .on : .off
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
        window.contentView = NSHostingView(rootView: GateView())
        window.isReleasedWhenClosed = false      // reopen from the menu bar
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

@MainActor
extension AppDelegate: NSMenuDelegate {
    /// Marks are set as the menu opens rather than kept in sync by hand. There is no
    /// window in which the menu can be showing something that is no longer true.
    func menuNeedsUpdate(_ menu: NSMenu) {
        refreshStatusItem()
        guard let overlay, menu === statusItem?.menu || menu === lookMenu else { return }

        for item in lookMenu?.items ?? [] {
            if let raw = item.representedObject as? String {
                item.state = raw == overlay.preset.rawValue ? .on : .off
            }
            for child in item.submenu?.items ?? [] {
                guard let raw = child.representedObject as? String else { continue }
                child.state = (raw == overlay.size.rawValue || raw == overlay.position.rawValue) ? .on : .off
            }
        }
    }
}

/// Lets the menu bar reach the overlay owned by the SwiftUI view tree. One reference
/// rather than a bag of closures: the menu needs to *read* state to draw its marks,
/// not only to fire actions.
@MainActor
final class OverlayBridge {
    static let shared = OverlayBridge()
    var controller: OverlayController?
}
