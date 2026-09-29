import AppKit
import OSLog
import WebKit
import UniformTypeIdentifiers

/// The notes editor: the bundled React editor in a window, reading the
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
        // The pages draw the wordmark beside the traffic lights; the title stays for the
        // Window menu and Mission Control.
        window.titleVisibility = .hidden
        // The pages are paper-light in every system mode; a dark titlebar would draw
        // the title in white over them and it would vanish.
        window.appearance = NSAppearance(named: .aqua)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("ExcerptNotes")
        window.minSize = NSSize(width: 720, height: 520)

        super.init(window: window)
        window.contentView = makeContent(titlebarHeight: window.frame.height - window.contentLayoutRect.height)
        bridge.onMeetingChange = { [weak self] json in self?.receive(meetingJSON: json) }
        bridge.onDesktopSettingsChange = { [weak self] json in self?.receive(settingsJSON: json) }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a nib") }

    /// The page runs under the transparent titlebar, so that strip is web content and a
    /// drag there never reaches AppKit. A native strip over it takes drags back.
    private func makeContent(titlebarHeight: CGFloat) -> NSView {
        let webView = makeWebView()
        let strip = TitlebarDragView(passingClicksTo: webView)
        let container = NSView()
        for view in [webView, strip] {
            view.translatesAutoresizingMaskIntoConstraints = false
            container.addSubview(view)
        }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            strip.topAnchor.constraint(equalTo: container.topAnchor),
            strip.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            strip.heightAnchor.constraint(equalToConstant: max(titlebarHeight, 28)),
        ])
        return container
    }

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

    /// Brings the window back as it was left, loading the library only the first
    /// time, so reopening the app does not throw away a half-read meeting.
    func reveal() {
        if webView.url == nil { show(route: "#/home") } else { present() }
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
        guard let data = try? JSONEncoder().encode("#/m/\(id)"),
              let literal = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("location.hash = \(literal)")
        present()
    }

    /// Pushes settled meeting state into React without reloading the editor or moving
    /// the person's cursor. JSONEncoder supplies a safe JavaScript string literal.
    private func receive(meetingJSON: String) {
        guard webView.url != nil,
              let data = try? JSONEncoder().encode(meetingJSON),
              let literal = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("globalThis.__excerptReceiveMeeting?.(\(literal))")
    }

    private func receive(settingsJSON: String) {
        guard webView.url != nil,
              let data = try? JSONEncoder().encode(settingsJSON),
              let literal = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("globalThis.__excerptReceiveDesktopSettings?.(\(literal))")
    }

    private func presentMissingNotes() {
        let alert = NSAlert()
        alert.messageText = "The notes view is missing from this build."
        alert.informativeText = "Rebuild it with: pnpm --filter @excerpt/editor build:notes"
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
        if url.scheme == NotesSchemeHandler.scheme && url.host == "notes" { return .allow }
        if navigationAction.navigationType == .linkActivated,
           let scheme = url.scheme?.lowercased(),
           ["http", "https", "mailto"].contains(scheme) {
            NSWorkspace.shared.open(url)
        }
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

/// Moves the window from the titlebar row. The page draws links in that row too, so
/// a press that does not move the window is handed to the page as the click it was;
/// a double-click does what System Settings says a titlebar double-click does.
final class TitlebarDragView: NSView {
    private weak var page: NSView?

    init(passingClicksTo page: NSView) {
        self.page = page
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a nib") }

    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        let origin = window.frame.origin
        window.performDrag(with: event)
        guard window.frame.origin == origin else { return }
        if event.clickCount == 2 {
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.miniaturize(nil)
            case "None": break
            default: window.zoom(nil)
            }
            return
        }
        guard let page else { return }
        page.mouseDown(with: event)
        if let up = NSEvent.mouseEvent(with: .leftMouseUp, location: event.locationInWindow,
                                       modifierFlags: event.modifierFlags,
                                       timestamp: ProcessInfo.processInfo.systemUptime,
                                       windowNumber: event.windowNumber, context: nil,
                                       eventNumber: event.eventNumber, clickCount: event.clickCount,
                                       pressure: 0) {
            page.mouseUp(with: up)
        }
    }
}
