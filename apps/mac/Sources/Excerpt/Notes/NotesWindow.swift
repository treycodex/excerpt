import AppKit
import OSLog
import WebKit
import UniformTypeIdentifiers

/// The notes editor: the same React app the website serves, in a window, reading the
/// Mac's own meetings through `NotesBridge`.
///
/// Reused rather than rebuilt because the editor is where a year of judgement lives —
/// evidence scrubbing, corrections, the needs-review treatment, the export. A native
/// rewrite would be a second implementation of all of it, drifting from the one that
/// has been tested.
@MainActor
final class NotesWindowController: NSWindowController {

    private let bridge: NotesBridge
    private var webView: WKWebView!

    init(bridge: NotesBridge) {
        self.bridge = bridge

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1040, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Excerpt"
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("ExcerptNotes")
        window.minSize = NSSize(width: 720, height: 520)

        super.init(window: window)
        window.contentView = makeWebView()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a nib") }

    private func makeWebView() -> WKWebView {
        let controller = WKUserContentController()
        controller.addScriptMessageHandler(bridge, contentWorld: .page, name: "excerpt")
        controller.addUserScript(WKUserScript(
            source: NotesBridge.installScript,
            injectionTime: .atDocumentStart,   // before React's first render reads for it
            forMainFrameOnly: true
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        if let notes = Bundle.main.url(forResource: "notes", withExtension: nil) {
            configuration.setURLSchemeHandler(NotesSchemeHandler(root: notes),
                                              forURLScheme: NotesSchemeHandler.scheme)
        }
        // Nothing here should ever reach the network: the whole promise is that a
        // meeting stays on this Mac. There is no remote content to load, and a
        // request that tried would be a bug worth seeing in the log.
        configuration.suppressesIncrementalRendering = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")   // the page owns its ground
        webView.allowsBackForwardNavigationGestures = false
        self.webView = webView
        return webView
    }

    /// Loads the editor and, optionally, opens straight to one meeting. The route is
    /// the website's own hash route, so there is one router rather than a native
    /// notion of "which screen" that has to be kept in step with it.
    func show(meeting id: String? = nil) {
        show(route: id.map { "#/m/\($0)" } ?? "#/meetings")
    }

    /// Any of the editor's own hash routes. The router is the website's, so there is
    /// one notion of "which screen" rather than a native one kept in step with it.
    func show(route: String) {
        guard Bundle.main.url(forResource: "notes", withExtension: nil) != nil else {
            presentMissingNotes()
            return
        }
        guard let target = URL(string: "\(NotesSchemeHandler.origin)/index.html\(route)") else { return }
        webView.load(URLRequest(url: target))
        present()
    }

    /// Ordering front and telling DockPresence are the same act: a visible window is
    /// exactly what the Dock icon follows, and tracking one before it is on screen
    /// reports a window the rule cannot see.
    private func present() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let window { DockPresence.shared.track(window) }
    }

    /// Navigates an already-open window without reloading it, so opening a second
    /// meeting does not flash the whole editor.
    func navigate(toMeeting id: String) {
        guard webView.url != nil else { show(meeting: id); return }
        webView.evaluateJavaScript("location.hash = '#/m/\(id)'")
        present()
    }

    private func presentMissingNotes() {
        let alert = NSAlert()
        alert.messageText = "The notes view is missing from this build."
        alert.informativeText = "Rebuild it with: pnpm --filter @excerpt/web build:notes"
        alert.alertStyle = .critical
        alert.runModal()
    }
}

extension NotesWindowController: WKNavigationDelegate {
    /// The bundle only. A meeting never leaves this Mac, and the surest way to keep
    /// that true is for the window that displays them to refuse to go anywhere else —
    /// a link in a meeting opens in the user's browser instead.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if url.scheme == NotesSchemeHandler.scheme || url.isFileURL { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        Logger(subsystem: "com.excerpt.app", category: "notes")
            .error("notes failed to load: \(error.localizedDescription)")
    }
}

extension NotesWindowController: WKUIDelegate {
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
}
