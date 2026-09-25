import AppKit
import SwiftUI

/// The one window Excerpt opens on its own, and only ever once.
@MainActor
final class SetupWindowController: NSWindowController, NSWindowDelegate {

    private let model: SetupModel

    init(model: SetupModel) {
        self.model = model

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 920, height: 720),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Welcome to Excerpt"
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.center()

        super.init(window: window)
        window.delegate = self

        window.contentView = NSHostingView(rootView: SetupView(model: model) { [weak self] in
            self?.finish()
        })
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a nib") }

    func present() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let window { DockPresence.shared.track(window) }
    }

    /// The preview overlay is the setup's, not the meeting's. Leaving a sample caption
    /// floating over the desktop after setup closes would be the app failing to end.
    func windowWillClose(_ notification: Notification) {
        Task { await model.inputCheck.stop() }
    }

    private func finish() {
        model.overlay.update(speaker: "", text: "")
        model.overlay.hide()
        window?.close()
        DockPresence.shared.apply()
    }
}
