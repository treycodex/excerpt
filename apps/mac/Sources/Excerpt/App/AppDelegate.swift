import AppKit
import SwiftUI

/// The whole of Excerpt's chrome.
///
/// An accessory app has no Dock icon, so this menu is the only way in: it has to
/// answer where you are, what you can do, and how to get out, on its own. Everything
/// here is one click from the front, and the things a person does every meeting come
/// before the things they set once.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {

    private var statusItem: NSStatusItem?
    private var statusLine: NSMenuItem?
    private var listenItem: NSMenuItem?
    private var captionsItem: NSMenuItem?
    private var lookMenu: NSMenu?

    private var engine: CoreEngine?
    private var store: MeetingStore?
    private var preferences = PreferencesStore()
    private var overlay = OverlayController()
    private var session: MeetingSession?
    private var notes: NotesWindowController?
    private var gateWindow: NSWindow?
    private var setup: SetupWindowController?
    private var previewTimeout: Task<Void, Never>?
    private lazy var setupModel = SetupModel(overlay: overlay)

    /// Before the first frame, not after. Demoting to accessory in
    /// applicationDidFinishLaunching puts a Dock icon on screen for a moment and then
    /// takes it away, which reads as a glitch in an app whose whole point is that it
    /// is not in the way.
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        OverlayBridge.shared.controller = overlay
        makeStatusItem()

        do {
            let store = try MeetingStore()
            let engine = try CoreEngine()
            self.store = store
            self.engine = engine
            session = MeetingSession(engine: engine, store: store, overlay: overlay)
            notes = NotesWindowController(bridge: NotesBridge(store: store, preferences: preferences))
            offerRecovery(store: store)
        } catch {
            // Without the engine there are no notes and without the folder there is
            // nowhere to put them. Say so plainly at launch rather than at Stop, when
            // a real meeting's transcript is riding on it.
            presentStartupFailure(error)
        }

        // First run opens the setup by itself. Someone who has been through it once —
        // or declined once — is never shown it again unasked.
        if !setupModel.hasCompletedSetup && !CommandLine.arguments.contains("--diagnose") {
            showSetup()
        }

        // Launch flags, for driving the app from a terminal during development. They
        // do nothing a menu item does not; they just do it without a hand on a mouse.
        if CommandLine.arguments.contains("--gates") { showGateWindow() }
        if CommandLine.arguments.contains("--setup") { showSetup() }
        if let index = CommandLine.arguments.firstIndex(of: "--setup-step"),
           let name = CommandLine.arguments.dropFirst(index + 1).first,
           let step = SetupModel.Step.allCases.first(where: { "\($0)" == name }) {
            showSetup()
            Task { await setupModel.jump(to: step) }
        }
        if let index = CommandLine.arguments.firstIndex(of: "--notes") {
            let id = CommandLine.arguments.dropFirst(index + 1).first
            notes?.show(meeting: id?.hasPrefix("--") == false ? id : nil)
        }
        if CommandLine.arguments.contains("--captions") { overlay.show() }
        if let index = CommandLine.arguments.firstIndex(of: "--diagnose") {
            let seconds = CommandLine.arguments.dropFirst(index + 1).first.flatMap(Double.init) ?? 15
            Task { await runDiagnosis(seconds: seconds) }
        }
        refresh()
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

        // Status first, because "is it working?" is the question a person actually
        // arrives with. It is a label, not a control — feedback, not a thing to click.
        let status = NSMenuItem(title: "Not listening", action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        statusLine = status

        menu.addItem(.separator())

        let listen = NSMenuItem(title: "Start listening", action: #selector(toggleListening), keyEquivalent: "r")
        listen.keyEquivalentModifierMask = [.command, .shift]
        listen.target = self
        menu.addItem(listen)
        listenItem = listen

        let captions = NSMenuItem(title: "Show captions over my meeting",
                                  action: #selector(toggleOverlay), keyEquivalent: "c")
        captions.keyEquivalentModifierMask = [.command, .shift]
        captions.target = self
        menu.addItem(captions)
        captionsItem = captions

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
        lookMenu.addItem(.separator())
        // Choosing a look against a swatch is choosing it against the wrong thing.
        let tryIt = NSMenuItem(title: "Try it on screen", action: #selector(previewCaption), keyEquivalent: "")
        tryIt.target = self
        tryIt.image = Self.symbol("eye", "Try it on screen")
        lookMenu.addItem(tryIt)
        look.submenu = lookMenu
        menu.addItem(look)
        self.lookMenu = lookMenu

        menu.addItem(.separator())

        let openNotes = NSMenuItem(title: "Open notes", action: #selector(openNotes), keyEquivalent: "n")
        openNotes.keyEquivalentModifierMask = [.command]
        openNotes.target = self
        openNotes.image = Self.symbol("doc.text", "Open notes")
        menu.addItem(openNotes)

        // "Nothing leaves this Mac" is a claim. This is how a person checks it.
        let reveal = NSMenuItem(title: "Show where notes are kept", action: #selector(revealFolder), keyEquivalent: "")
        reveal.target = self
        reveal.image = Self.symbol("folder", "Show where notes are kept")
        menu.addItem(reveal)

        menu.addItem(.separator())

        let setupItem = NSMenuItem(title: "Set up Excerpt…", action: #selector(showSetup), keyEquivalent: "")
        setupItem.target = self
        setupItem.image = Self.symbol("sparkles", "Set up Excerpt")
        menu.addItem(setupItem)

        let gates = NSMenuItem(title: "Permissions and diagnostics…", action: #selector(showGateWindow), keyEquivalent: "")
        gates.target = self
        gates.image = Self.symbol("stethoscope", "Permissions and diagnostics")
        menu.addItem(gates)

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

    @objc private func toggleListening() {
        guard let session else { return }
        Task {
            if session.state.isActive {
                await session.stop()
                refresh()
                // The meeting is the point, so it opens itself. Nothing is lost if the
                // user closes it — the notes are already on disk.
                if let saved = session.lastSaved, !saved.items.isEmpty {
                    notes?.navigate(toMeeting: saved.id)
                }
            } else {
                guard await ensurePermissions() else { return }
                if !overlay.visible { overlay.show() }
                await session.start()
                refresh()
                suggestHeadphonesIfNeeded()
            }
        }
    }

    /// Asks for what is missing, one grant at a time, and explains the consequence of
    /// a refusal rather than failing at the first buffer.
    private func ensurePermissions() async -> Bool {
        for permission in Permission.allCases {
            var state = await Permissions.state(of: permission)
            if state == .undetermined { state = await Permissions.request(permission) }

            if permission == .screenRecording, state != .granted {
                // Measured in Stage 0: the grant only takes effect after a relaunch,
                // and an app that does not say so looks broken to someone who has just
                // ticked the box.
                _ = await Permissions.request(.screenRecording)
                present(
                    title: "Excerpt needs permission to hear your meeting",
                    body: "Allow Excerpt under Screen & System Audio Recording, then quit and open Excerpt again. macOS only applies this one after a restart of the app.",
                    style: .warning
                )
                return false
            }

            if state != .granted {
                present(
                    title: "Excerpt needs \(permission.rawValue.lowercased()) access",
                    body: consequence(of: permission),
                    style: .warning
                )
                return false
            }
        }
        return true
    }

    private func consequence(of permission: Permission) -> String {
        switch permission {
        case .microphone:
            "Without it, Excerpt can hear the other people in the meeting but not you — so nothing will ever be marked as yours. Turn it on in System Settings › Privacy & Security › Microphone."
        case .screenRecording:
            "This is how macOS lets an app hear the meeting's audio. Nothing about your screen is recorded or saved. Turn it on in System Settings › Privacy & Security › Screen & System Audio Recording."
        case .speech:
            "Excerpt turns speech into text on this Mac, and macOS asks permission for that even though nothing is uploaded. Turn it on in System Settings › Privacy & Security › Speech Recognition."
        }
    }

    private func suggestHeadphonesIfNeeded() {
        guard let session, session.shouldSuggestHeadphones else { return }
        present(
            title: "Your microphone is picking up the meeting",
            body: "Excerpt is hearing the same words twice, which makes it harder to tell who said what. Headphones fix it completely.",
            style: .informational
        )
    }

    @objc private func toggleOverlay() {
        overlay.toggle()
        refresh()
    }

    @objc private func openNotes() {
        notes?.show()
    }

    @objc private func revealFolder() {
        guard let folder = store?.folder else { return }
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: folder.path(percentEncoded: false))
    }

    @objc private func showSetup() {
        if setup == nil { setup = SetupWindowController(model: setupModel) }
        setup?.present()
    }

    /// A sample caption in the real overlay, so a look can be judged where it will be
    /// seen. It goes away on its own — during a meeting the live text simply replaces
    /// it, and outside one there is nothing to leave behind.
    @objc private func previewCaption() {
        overlay.show()
        overlay.update(speaker: "SPEAKER",
                       text: "Okay. Let's move the campaign launch to October. That's decided.")
        refresh()

        guard session?.state.isActive != true else { return }
        previewTimeout?.cancel()
        previewTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard let self, self.session?.state.isActive != true else { return }
            self.overlay.update(speaker: "", text: "")
        }
    }

    @objc private func showGateWindow() {
        if gateWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            window.title = "Excerpt — permissions and diagnostics"
            window.center()
            window.contentView = NSHostingView(rootView: GateView())
            window.isReleasedWhenClosed = false
            gateWindow = window
        }
        gateWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func choosePreset(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let preset = CaptionPreset(rawValue: raw) else { return }
        overlay.setPreset(preset)
    }

    @objc private func chooseSize(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let size = CaptionSize(rawValue: raw) else { return }
        overlay.setSize(size)
    }

    @objc private func choosePosition(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let position = CaptionPosition(rawValue: raw) else { return }
        overlay.setPosition(position)
    }

    /// Records one unattended meeting and writes down what every part of it did.
    ///
    /// The app has to be launched through LaunchServices for TCC to attribute
    /// permissions to it rather than to a terminal, which means stdout goes nowhere —
    /// so the report goes to a file next to the meetings.
    private func runDiagnosis(seconds: Double) async {
        var report = ["Excerpt diagnosis — \(Date().formatted())"]

        for permission in Permission.allCases {
            report.append("  \(permission.rawValue): \(await Permissions.state(of: permission).rawValue)")
        }

        guard let session else {
            report.append("  session unavailable — the engine or the meetings folder failed to open")
            writeDiagnosis(report)
            NSApp.terminate(nil)
            return
        }

        await session.start()
        report.append("  after start: \(session.status)")
        try? await Task.sleep(for: .seconds(seconds))
        await session.stop()

        report.append("  sources: \(session.diagnosis)")
        report.append("  events: \(session.lastSaved?.events.count ?? 0)")
        report.append("  items: \(session.lastSaved?.items.count ?? 0)")
        report.append("  verdict: \(session.status)")
        for event in session.lastSaved?.events.prefix(8) ?? [] {
            report.append(String(format: "    %@ %.2f–%.2f “%@”",
                                 event.speakerLabel, event.tStart ?? -1, event.tEnd ?? -1, event.text))
        }

        writeDiagnosis(report)
        NSApp.terminate(nil)
    }

    private func writeDiagnosis(_ lines: [String]) {
        guard let folder = store?.folder else { return }
        try? lines.joined(separator: "\n").appending("\n")
            .write(to: folder.appending(path: "diagnose.txt"), atomically: true, encoding: .utf8)
    }

    // MARK: - Recovery

    /// A meeting whose journal outlived the app. Offered, never restored silently — a
    /// transcript appearing on its own is its own kind of surprise.
    private func offerRecovery(store: MeetingStore) {
        let interrupted = store.recoverable()
        guard !interrupted.isEmpty, let session else { return }

        let alert = NSAlert()
        alert.messageText = interrupted.count == 1
            ? "A meeting ended unexpectedly"
            : "\(interrupted.count) meetings ended unexpectedly"
        alert.informativeText = "Excerpt kept what it had already heard. Would you like the notes from it?"
        alert.addButton(withTitle: "Recover")
        alert.addButton(withTitle: "Discard")
        alert.alertStyle = .informational

        guard alert.runModal() == .alertFirstButtonReturn else {
            for id in interrupted { store.discardJournal(id: id) }
            return
        }
        var recovered: Meeting?
        for id in interrupted { recovered = session.recover(id: id) ?? recovered }
        if let recovered { notes?.show(meeting: recovered.id) }
    }

    // MARK: - State

    /// Everything the menu shows, recomputed from the session rather than tracked
    /// alongside it. There is no state here that can disagree with what is happening.
    private func refresh() {
        let listening = session?.state.isActive ?? false
        let captionsOn = overlay.visible

        statusItem?.button?.image = Self.symbol(
            listening ? "captions.bubble.fill" : "captions.bubble", "Excerpt")
        statusLine?.title = session?.status ?? "Not listening"
        listenItem?.title = listening ? "Stop listening" : "Start listening"
        listenItem?.image = Self.symbol(listening ? "stop.circle" : "record.circle",
                                        listening ? "Stop listening" : "Start listening")
        captionsItem?.state = captionsOn ? .on : .off
    }

    private func present(title: String, body: String, style: NSAlert.Style) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = body
        alert.alertStyle = style
        alert.runModal()
    }

    private func presentStartupFailure(_ error: Error) {
        present(
            title: "Excerpt could not start",
            body: error.localizedDescription,
            style: .critical
        )
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// Quitting mid-meeting must not lose the meeting. The journal already holds
    /// every settled line, so the worst case is a recovery prompt next launch — but
    /// stopping cleanly turns it into a saved meeting instead.
    func applicationWillTerminate(_ notification: Notification) {
        guard let session, session.state.isActive else { return }
        let finished = DispatchSemaphore(value: 0)
        Task { await session.stop(); finished.signal() }
        _ = finished.wait(timeout: .now() + 5)
    }
}

extension AppDelegate: NSMenuDelegate {
    /// Marks and titles are set as the menu opens. There is no window in which the
    /// menu can be showing something that is no longer true.
    func menuNeedsUpdate(_ menu: NSMenu) {
        refresh()
        guard menu === statusItem?.menu || menu === lookMenu else { return }

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

/// Lets the gate window reach the overlay the app owns.
@MainActor
final class OverlayBridge {
    static let shared = OverlayBridge()
    var controller: OverlayController?
}
