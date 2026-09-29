import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// The whole of Excerpt's chrome.
///
/// Excerpt is a menu-bar app that visits the Dock (see DockPresence), so with no window
/// open this menu is the only way in: it has to answer where you are, what you can do,
/// and how to get out, on its own. Everything here is one click from the front, and the
/// things a person does every meeting come before the things they set once.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {

    private var statusItem: NSStatusItem?
    private var statusLine: NSMenuItem?
    private var listenItem: NSMenuItem?
    private var captionsItem: NSMenuItem?
    private var lookMenu: NSMenu?
    private var displayMenu: NSMenu?
    private var shortcutMenu: NSMenu?
    private let shortcuts = MeetingShortcuts()
    private let catchUp = CatchUpWindowController()
    private let captureReceipt = CaptureReceiptController()
    private let screenshotCapture = MeetingScreenshotCoordinator()
    private let screenshotWindowHandoff = MeetingScreenshotWindowHandoff()
    private let systemScreenshots = SystemScreenshotImporter()
    private let termination = ApplicationTerminationCoordinator()
    private var screenshotItem: NSMenuItem?
    private var catchUpItem: NSMenuItem?
    private var noticeItem: NSMenuItem?
    private let detector = MeetingDetector()
    private let meetingPrompt = MeetingPromptController()
    /// The call app the running meeting is taking place in, if Excerpt saw one. Its
    /// letting go of the microphone is what prompts the end question.
    private var followedApp: MeetingApp? {
        didSet { if followedApp != oldValue { bridge?.publishDesktopSettings() } }
    }

    private var engine: CoreEngine?
    private var store: MeetingStore?
    private var preferences = PreferencesStore()
    private var overlay = OverlayController()
    private var microphone = MicrophoneController()
    private var session: MeetingSession?
    private var commands: MeetingCommandCoordinator?
    private var bridge: NotesBridge?
    private var notes: NotesWindowController?
    private var gateWindow: NSWindow?
    private var setup: SetupWindowController?
    private var previewTimeout: Task<Void, Never>?
    private lazy var setupModel = SetupModel(
        overlay: overlay, microphone: microphone,
        requestScreenshotAccess: { [weak self] in try self?.setScreenshotImportEnabled(true) },
        screenshotFolderName: { [weak self] in self?.systemScreenshots.destinationName })

    /// Before the first frame, not after. Coming up as a regular app and demoting in
    /// applicationDidFinishLaunching puts a Dock icon on screen for a moment and then
    /// takes it away, which reads as a glitch. The rule starts it at accessory and the
    /// icon appears with the first window — the meetings window, or setup on first run.
    func applicationWillFinishLaunching(_ notification: Notification) {
        DockPresence.shared.onChange = { [weak self] in self?.overlay.policyDidChange() }
        DockPresence.shared.apply()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // A permission report must not initialize capture, notes, recovery prompts or
        // the editor. It exists specifically to answer one TCC question and quit.
        if CommandLine.arguments.contains("--permissions-report") {
            Task { await writePermissionReportAndQuit() }
            return
        }
        OverlayBridge.shared.controller = overlay
        makeStatusItem()
        makeEditingMenu()
        shortcuts.onMeeting = { [weak self] in self?.toggleMeetingCommand() }
        shortcuts.onCaptions = { [weak self] in self?.toggleOverlay() }
        shortcuts.onCatchUp = { [weak self] in self?.showCatchUp() }
        shortcuts.onScreenshot = { [weak self] in self?.takeScreenshot() }
        shortcuts.onStatusChange = { [weak self] in
            self?.refresh()
            self?.bridge?.publishDesktopSettings()
        }

        do {
            let store = try MeetingStore(root: Self.phase7FixtureRoot())
            let engine = try CoreEngine()
            self.store = store
            self.engine = engine
            // One phrase breaker, not two: a caption breaks in the same place over a
            // meeting as it does on the website, because it is the same code deciding.
            overlay.breakLines = { text in
                (try? engine.subtitleLines(text, maxChars: CaptionTokens.maxCharsPerLine))
                    ?? OverlayController.fallbackLines(text)
            }
            let capture = CaptureEngine(selectedMicrophoneID: { [weak self] in
                guard let self else { throw MicrophoneSelectionError.unavailable }
                return try self.microphone.selectedDeviceIDForCapture()
            })
            let session = MeetingSession(engine: engine, store: store,
                                         preferences: preferences, overlay: overlay,
                                         capture: capture)
            self.session = session
            session.onStateChange = { [weak self] in
                guard let self else { return }
                self.microphone.selectionLocked = self.session?.state.isActive == true
                if self.session?.state.isActive != true, self.commands?.isStarting != true {
                    self.followedApp = nil
                    if self.meetingPrompt.kind == .end { self.meetingPrompt.close() }
                }
                self.syncSystemScreenshots()
                self.refresh()
                self.bridge?.publishDesktopSettings()
            }
            session.onHealthChange = { [weak self] in self?.bridge?.publishDesktopSettings() }
            commands = MeetingCommandCoordinator(
                isActive: { [weak session] in session?.state.isActive == true },
                start: { [weak self, weak session] title in
                    guard let self, let session else { return false }
                    await self.setupModel.inputCheck.stop()
                    guard await self.ensurePermissions() else {
                        throw MeetingCommandError.unavailable("Allow microphone, speech recognition, and Screen & System Audio Recording in System Settings before starting a meeting.")
                    }
                    try Task.checkCancellation()
                    self.previewTimeout?.cancel()
                    self.setup?.close()
                    _ = try self.microphone.selectedDeviceIDForCapture()
                    await session.start(title: title)
                    guard session.canCaptureImage else {
                        try Task.checkCancellation()
                        throw MeetingCommandError.unavailable(session.status)
                    }
                    if self.overlay.captionsEnabled { self.overlay.show() }
                    if self.meetingPrompt.kind == .start { self.meetingPrompt.close() }
                    if self.followedApp == nil { self.followedApp = self.detector.active.first }
                    self.refresh()
                    return true
                },
                stop: { [weak self, weak session] in
                    self?.screenshotCapture.cancel()
                    self?.screenshotWindowHandoff.restore()
                    if self?.systemScreenshots.isWatching == true {
                        self?.systemScreenshots.scan()
                        try? await Task.sleep(for: .milliseconds(250))
                        self?.systemScreenshots.scan()
                        self?.systemScreenshots.stop()
                    }
                    self?.catchUp.close()
                    self?.followedApp = nil
                    if self?.meetingPrompt.kind == .end { self?.meetingPrompt.close() }
                    await session?.stop()
                    self?.refresh()
                },
                didStart: { if NSApp.isActive { NSApp.hide(nil) } }
            )
            let bridge = NotesBridge(
                store: store, preferences: preferences,
                activeMeeting: { [weak session] id in session?.activeMeeting(id: id) },
                mutateLiveMeeting: { [weak session] mutation in
                    try session?.applyEditorMutation(mutation)
                },
                didDeleteMeeting: { [weak session] id in session?.cancelBackgroundWork(for: id) },
                startMeeting: { [weak self] title in try await self?.commands?.start(title: title) },
                endMeeting: { [weak self] in await self?.commands?.end() },
                setNoticeMeetings: { [weak self] enabled in self?.setNoticeMeetings(enabled) },
                openLiveNotes: { [weak self] in self?.openLiveNotesFromEditor() },
                liveMeetingTime: { [weak session] id in session?.currentMeetingTime(id: id) },
                retryAutomaticNotes: { [weak session] id in
                    guard let session else { throw NSError(domain: "Excerpt", code: 1) }
                    return try session.retryAutomaticNotes(id: id)
                },
                desktopSettings: { [weak self] in self?.desktopSettings() ?? Self.emptyDesktopSettings },
                saveCaptionSettings: { [weak self] settings in self?.applyCaptionSettings(settings) },
                selectMicrophone: { [weak self] id in try self?.microphone.select(id) },
                setScreenshotImportEnabled: { [weak self] enabled in try self?.setScreenshotImportEnabled(enabled) }
            )
            self.bridge = bridge
            session.onMeetingChange = { [weak bridge] meeting in bridge?.publish(meeting) }
            notes = NotesWindowController(bridge: bridge)
            overlay.onSettingsChange = { [weak self] in
                self?.refresh()
                self?.bridge?.publishDesktopSettings()
            }
            microphone.onChange = { [weak self] in
                guard let self else { return }
                if self.microphone.snapshot().health == .missing {
                    self.session?.selectedMicrophoneDisconnected(self.microphone.selectedDeviceName)
                }
                self.bridge?.publishDesktopSettings()
            }
            session.onMeetingFinished = { [weak self] meeting in
                guard let self, !self.termination.isPending else { return }
                self.notes?.navigate(toMeeting: meeting.id)
            }
            screenshotCapture.onChange = { [weak self] in self?.refresh() }
            systemScreenshots.onAvailabilityChange = { [weak self] in self?.refresh() }
            session.resumePendingEnhancements()
            offerRecovery(store: store)
            shortcuts.registerCore()
            detector.onEdge = { [weak self] edge in self?.meetingAppEdge(edge) }
            syncMeetingDetection()
        } catch {
            // Without the engine there are no notes and without the folder there is
            // nowhere to put them. Say so plainly at launch rather than at Stop, when
            // a real meeting's transcript is riding on it.
            presentStartupFailure(error)
        }

        // First run opens the setup by itself. Someone who has been through it once —
        // or declined once — is never shown it again unasked.
        if !setupModel.hasCompletedSetup && !CommandLine.arguments.contains("--diagnose")
            && !CommandLine.arguments.contains("--permissions-report") {
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
        if let index = CommandLine.arguments.firstIndex(of: "--notes-route"),
           let route = CommandLine.arguments.dropFirst(index + 1).first {
            notes?.show(route: route)
        }
        if let index = CommandLine.arguments.firstIndex(of: "--notes") {
            let id = CommandLine.arguments.dropFirst(index + 1).first
            notes?.show(meeting: id?.hasPrefix("--") == false ? id : nil)
        }
        if Bundle.main.bundleIdentifier?.hasPrefix("com.excerpt.phase7fixture.") == true {
            notes?.show()
        }
        if CommandLine.arguments.contains("--captions") { overlay.show() }
        // Opening the app opens the app: the meetings window, with Start in it. First
        // run belongs to setup, and development flags decide for themselves.
        let hasLaunchFlags = CommandLine.arguments.dropFirst().contains { $0.hasPrefix("--") }
        if setupModel.hasCompletedSetup, !hasLaunchFlags, notes?.window?.isVisible != true {
            notes?.reveal()
        }
        if let index = CommandLine.arguments.firstIndex(of: "--diagnose") {
            let arguments = Array(CommandLine.arguments.dropFirst(index + 1))
            let seconds = arguments.first.flatMap(Double.init) ?? 15
            // A second meeting in the same launch is its own test — see trap 13. The
            // tool only ever ran one, which is why an empty second transcript could
            // survive every diagnosis this app has ever produced.
            let runs = arguments.dropFirst().first.flatMap(Int.init) ?? 1
            Task { await runDiagnosis(seconds: seconds, runs: max(1, runs)) }
        }
        refresh()
    }

    /// A debug-only UI fixture must never fall through to the real meeting store.
    /// The separate fixture app bundle also gives it its own UserDefaults/TCC identity.
    private static func phase7FixtureRoot() throws -> URL? {
        let isFixtureBundle = Bundle.main.bundleIdentifier?.hasPrefix("com.excerpt.phase7fixture.") == true
        guard isFixtureBundle else { return nil }
#if DEBUG
        guard let path = Bundle.main.object(forInfoDictionaryKey: "ExcerptPhase7FixtureRoot") as? String,
              path.hasPrefix("/private/tmp/excerpt-phase7-ui-"),
              !path.contains("/../") else {
            throw MeetingStore.Failure.directoryUnavailable("Invalid Phase 7 fixture root")
        }
        let root = URL(fileURLWithPath: path, isDirectory: true).resolvingSymlinksInPath()
        let marker = try? String(contentsOf: root.appending(path: ".excerpt-phase7-fixture"),
                                 encoding: .utf8)
        guard ["/private/tmp", "/tmp"].contains(root.deletingLastPathComponent().path),
              root.lastPathComponent.hasPrefix("excerpt-phase7-ui-"),
              marker == "synthetic-only\n" else {
            throw MeetingStore.Failure.directoryUnavailable("Unmarked Phase 7 fixture root")
        }
        return root
#else
        throw MeetingStore.Failure.directoryUnavailable("Phase 7 fixture root requires a debug build")
#endif
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

        let listen = MeetingShortcuts.menuItem(title: "Start meeting", action: #selector(toggleListening))
        listen.target = self
        menu.addItem(listen)
        listenItem = listen

        let captions = MeetingShortcuts.menuItem(title: "Captions", action: #selector(toggleOverlay))
        captions.target = self
        menu.addItem(captions)
        captionsItem = captions

        let catchUp = MeetingShortcuts.menuItem(title: "Catch up", action: #selector(showCatchUp))
        catchUp.target = self
        menu.addItem(catchUp)
        catchUpItem = catchUp
        let screenshot = MeetingShortcuts.menuItem(title: "Capture moment…", action: #selector(takeScreenshot))
        screenshot.target = self
        menu.addItem(screenshot)
        screenshotItem = screenshot

        let notice = NSMenuItem(title: "Notice meetings", action: #selector(toggleNoticeMeetings), keyEquivalent: "")
        notice.target = self
        notice.image = Self.symbol("waveform.badge.mic", "Notice meetings")
        notice.toolTip = "Offer to start a transcript when Zoom, Teams, Meet or another call app starts using the microphone, and to end it when the call does."
        menu.addItem(notice)
        noticeItem = notice

        let openNotes = NSMenuItem(title: "Open meetings", action: #selector(openNotes), keyEquivalent: "n")
        openNotes.keyEquivalentModifierMask = [.command]
        openNotes.target = self
        openNotes.image = Self.symbol("doc.text", "Open meetings")
        menu.addItem(openNotes)

        menu.addItem(.separator())

        let settings = NSMenuItem(title: "Settings & Help", action: nil, keyEquivalent: "")
        let settingsMenu = NSMenu()

        let preferencesItem = NSMenuItem(title: "Open Settings…", action: #selector(openSettings), keyEquivalent: ",")
        preferencesItem.keyEquivalentModifierMask = [.command]
        preferencesItem.target = self
        settingsMenu.addItem(preferencesItem)

        // Styling stays available without competing with everyday meeting controls.
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
        settingsMenu.addItem(look)
        self.lookMenu = lookMenu

        let display = NSMenuItem(title: "Caption display", action: nil, keyEquivalent: "")
        let displayMenu = NSMenu()
        display.submenu = displayMenu
        settingsMenu.addItem(display)
        self.displayMenu = displayMenu

        let shortcutItem = NSMenuItem(title: "Keyboard shortcuts", action: nil, keyEquivalent: "")
        let shortcutMenu = NSMenu()
        shortcutItem.submenu = shortcutMenu
        settingsMenu.addItem(shortcutItem)
        self.shortcutMenu = shortcutMenu

        settingsMenu.addItem(.separator())

        // "Nothing leaves this Mac" is a claim. This is how a person checks it.
        let reveal = NSMenuItem(title: "Show meeting storage", action: #selector(revealFolder), keyEquivalent: "")
        reveal.target = self
        reveal.image = Self.symbol("folder", "Show meeting storage")
        settingsMenu.addItem(reveal)

        let setupItem = NSMenuItem(title: "Set up Excerpt…", action: #selector(showSetup), keyEquivalent: "")
        setupItem.target = self
        setupItem.image = Self.symbol("sparkles", "Set up Excerpt")
        settingsMenu.addItem(setupItem)

        let gates = NSMenuItem(title: "Permissions and diagnostics…", action: #selector(showGateWindow), keyEquivalent: "")
        gates.target = self
        gates.image = Self.symbol("stethoscope", "Permissions and diagnostics")
        settingsMenu.addItem(gates)
        settings.submenu = settingsMenu
        menu.addItem(settings)

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
        toggleMeetingCommand()
    }

    private func toggleMeetingCommand() {
        // The shortcut answers an open start question, taking the name typed so far.
        if meetingPrompt.kind == .start, let app = meetingPrompt.app,
           session?.state.isActive != true, commands?.isStarting != true {
            let title = meetingPrompt.title
            meetingPrompt.close()
            startMeeting(title: title, following: app)
            return
        }
        Task {
            do { try await commands?.toggle() }
            catch is CancellationError { }
            catch { present(title: "Meeting could not start", body: error.localizedDescription, style: .warning) }
        }
    }

    private func startMeeting(title: String?, following app: MeetingApp) {
        followedApp = app
        Task {
            do { try await commands?.start(title: title) }
            catch is CancellationError { followedApp = nil }
            catch {
                followedApp = nil
                present(title: "Meeting could not start", body: error.localizedDescription, style: .warning)
            }
        }
    }

    // MARK: - Noticing meetings

    private static let noticeMeetingsKey = "ExcerptNoticeMeetings"

    private var noticesMeetings: Bool {
        UserDefaults.standard.object(forKey: Self.noticeMeetingsKey) as? Bool ?? true
    }

    @objc private func toggleNoticeMeetings() {
        setNoticeMeetings(!noticesMeetings)
    }

    private func setNoticeMeetings(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: Self.noticeMeetingsKey)
        syncMeetingDetection()
        refresh()
        bridge?.publishDesktopSettings()
    }

    /// Off means not listening at all, not listening and staying quiet. Development
    /// launches that drive a meeting by themselves never listen.
    private func syncMeetingDetection() {
        let unattended = CommandLine.arguments.contains("--diagnose")
            || Bundle.main.bundleIdentifier?.hasPrefix("com.excerpt.phase7fixture.") == true
        if noticesMeetings, session != nil, !unattended {
            detector.start()
        } else {
            detector.stop()
            meetingPrompt.close()
            followedApp = nil
        }
    }

    private func meetingAppEdge(_ edge: MeetingDetector.Edge) {
        let meetingOn = session?.state.isActive == true || commands?.isStarting == true
        switch edge {
        case .began(let app):
            if meetingOn {
                // Taking the microphone back after muting is the same meeting.
                if meetingPrompt.kind == .end, meetingPrompt.app == app { meetingPrompt.close() }
                if followedApp == nil { followedApp = app }
                return
            }
            // First run is the setup's turn to talk.
            guard setupModel.hasCompletedSetup, !meetingPrompt.isVisible else { return }
            Task { [weak self] in
                let guess = MeetingTitleGuess.guess(from: await MeetingTitleGuess.windowTitles(for: app))
                guard let self, self.detector.active.contains(app), !self.meetingPrompt.isVisible,
                      self.session?.state.isActive != true, self.commands?.isStarting != true else { return }
                self.meetingPrompt.show(.start, app: app, title: guess) { [weak self] title in
                    self?.startMeeting(title: title, following: app)
                }
            }
        case .ended(let app):
            if meetingPrompt.kind == .start, meetingPrompt.app == app { meetingPrompt.close() }
            guard session?.state.isActive == true, followedApp == app else { return }
            // Moving the call to another app (a browser to the desktop client, say)
            // is not the meeting ending.
            if let next = detector.active.first {
                followedApp = next
                return
            }
            meetingPrompt.show(.end, app: app, title: session?.titleSuggestion()) { [weak self] title in
                guard let self else { return }
                if let title { self.session?.rename(title) }
                Task { await self.commands?.end() }
            }
        }
    }

    @objc private func showCatchUp() {
        guard let session, session.canCaptureImage else { return }
        if catchUp.isVisible {
            catchUp.close()
            if overlay.captionsEnabled { overlay.show() }
            return
        }
        overlay.hide()
        catchUp.show(events: session.catchUpEvents, now: session.elapsedMilliseconds,
                     source: { [weak session] in (session?.catchUpEvents ?? [], session?.elapsedMilliseconds ?? 0) },
                     onReturn: { [weak self] in
                         guard let self, self.overlay.captionsEnabled else { return }
                         self.overlay.show()
                     },
                     onImages: { [weak self] providers, origin in self?.addMeetingImages(providers, origin: origin) })
    }

    private func openLiveNotesFromEditor() {
        guard let session, session.canCaptureImage else { return }
        notes?.navigate(toMeeting: session.meetingId)
    }

    private func addMeetingImages(_ providers: [NSItemProvider], origin: String) {
        guard let session, session.canCaptureImage else { return }
        let id = session.meetingId
        let capturedAt = Date()
        for provider in providers {
            Task {
                do {
                    let data: Data = try await withCheckedThrowingContinuation { continuation in
                        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                            provider.loadDataRepresentation(forTypeIdentifier: UTType.fileURL.identifier) { data, error in
                                do {
                                    if let error { throw error }
                                    guard let data, let url = URL(dataRepresentation: data, relativeTo: nil), url.isFileURL else { throw MeetingScreenshot.Failure.unreadable }
                                    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                                    guard size <= 20 * 1024 * 1024 else { throw MeetingScreenshot.Failure.unreadable }
                                    continuation.resume(returning: try Data(contentsOf: url))
                                } catch { continuation.resume(throwing: error) }
                            }
                        } else {
                            provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, error in
                                if let error { continuation.resume(throwing: error) }
                                else if let data { continuation.resume(returning: data) }
                                else { continuation.resume(throwing: MeetingScreenshot.Failure.unreadable) }
                            }
                        }
                    }
                    let image = try session.addScreenshot(MeetingScreenshot.fromData(data, capturedAt: capturedAt, origin: origin), for: id)
                    captureReceipt.show(image)
                    catchUp.showNotice("Screenshot added to your transcript")
                    refresh()
                } catch {
                    present(title: "Image wasn't added", body: error.localizedDescription, style: .warning)
                }
            }
        }
    }

    @objc private func takeScreenshot() {
        guard let session, session.canCaptureImage, !screenshotCapture.isCapturing else { return }
        let id = session.meetingId
        let restoreCaptions = overlay.visible
        overlay.hide()
        catchUp.close()
        // The system region picker captures what is on screen. A visible notes
        // window would cover the app the person was looking at when they pressed
        // the global shortcut, so get all of Excerpt's windows out of its way.
        screenshotWindowHandoff.begin()
        screenshotCapture.start(
            meetingID: id,
            onCapture: { [weak self, weak session] meetingID, capture in
                guard let self, let session else { return }
                do {
                    let image = try session.addScreenshot(capture, for: meetingID)
                    self.captureReceipt.show(image)
                } catch {
                    self.present(title: "Screenshot wasn't added", body: error.localizedDescription, style: .warning)
                }
            },
            onFailure: { [weak self] error in
                self?.present(title: "Screenshot wasn't added", body: error.localizedDescription, style: .warning)
            },
            onComplete: { [weak self, weak session] in
                self?.screenshotWindowHandoff.restore()
                guard let self, let session, restoreCaptions,
                      session.canCaptureImage, self.overlay.captionsEnabled else { return }
                self.overlay.show()
            }
        )
    }

    private func syncSystemScreenshots() {
        guard UserDefaults.standard.bool(forKey: SystemScreenshotImporter.preferenceKey),
              let session, session.canCaptureImage else {
            systemScreenshots.stop()
            return
        }
        systemScreenshots.start(
            meetingID: session.meetingId,
            onCapture: { [weak self, weak session] meetingID, capture in
                guard let self, let session else { return }
                do {
                    let image = try session.addScreenshot(capture, for: meetingID)
                    self.captureReceipt.show(image)
                } catch {
                    self.present(title: "Screenshot wasn't added", body: error.localizedDescription, style: .warning)
                }
            },
            onFailure: { [weak self] error in
                self?.present(title: "Screenshot wasn't added", body: error.localizedDescription, style: .warning)
            }
        )
    }

    private func makeEditingMenu() {
        let main = NSMenu()
        let app = NSMenuItem(); app.submenu = NSMenu()
        app.submenu?.addItem(withTitle: "Quit Excerpt", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        main.addItem(app)
        let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let menu = NSMenu(title: "Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            menu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        edit.submenu = menu
        main.addItem(edit)
        NSApp.mainMenu = main
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

    @objc private func toggleOverlay() {
        let enabled = !overlay.captionsEnabled
        overlay.setCaptionsEnabled(enabled)
        if enabled, session?.canCaptureImage == true { overlay.show() }
        else { overlay.hide() }
        refresh()
    }

    @objc private func openNotes() {
        if let session, session.state.isActive, !session.meetingId.isEmpty {
            notes?.show(meeting: session.meetingId)
        } else {
            notes?.show()
        }
    }

    @objc private func openSettings() {
        notes?.show(route: "#/preferences")
    }

    @objc private func revealFolder() {
        guard let folder = store?.folder else { return }
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: folder.path(percentEncoded: false))
    }

    @objc private func showSetup() {
        guard session?.state.isActive != true else {
            openSettings()
            return
        }
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
            self.overlay.hide()
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
        if let gateWindow { DockPresence.shared.track(gateWindow) }
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

    @objc private func chooseDisplay(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        overlay.setDisplay(id)
    }

    @objc private func moveCaptionsToCurrentDisplay() {
        overlay.followPointer()
    }

    private static let emptyDesktopSettings = DesktopSettings(
        captions: CaptionSettings(preset: .classic, size: .medium, position: .standard,
            enabled: true, displayId: "", displays: [], displayMissing: true,
            displayName: "No display"),
        microphone: MicrophoneSettings(selectedDeviceId: "", devices: [], health: .missing,
            message: "No microphone is connected."), shortcuts: [])

    private func desktopSettings() -> DesktopSettings {
        microphone.refresh()
        var settings = DesktopSettings(
            captions: overlay.settings(),
            microphone: microphone.snapshot(liveHealth: session?.canCaptureImage == true ? session?.microphoneHealth : nil),
            shortcuts: shortcuts.statuses())
        settings.screenshotImport = ScreenshotImportSettings(
            enabled: UserDefaults.standard.bool(forKey: SystemScreenshotImporter.preferenceKey),
            folderName: systemScreenshots.destinationName)
        settings.meeting = liveMeetingStatus()
        settings.noticeMeetings = noticesMeetings
        return settings
    }

    private func liveMeetingStatus() -> LiveMeetingStatus {
        guard let session else { return .idle }
        let phase: LiveMeetingStatus.Phase
        var startedAt: String?
        switch session.state {
        case .starting: phase = .starting
        case .listening(let since):
            phase = .live
            startedAt = ISO8601DateFormatter().string(from: since)
        case .finishing: phase = .finishing
        case .idle, .completed, .interrupted, .failed:
            return LiveMeetingStatus(phase: .idle, status: session.status)
        }
        return LiveMeetingStatus(phase: phase, meetingId: session.meetingId, title: session.liveTitle,
                                 startedAt: startedAt, status: session.status, app: followedApp?.name)
    }

    private func setScreenshotImportEnabled(_ enabled: Bool) throws {
        if enabled { try systemScreenshots.requestFolderAccess() }
        UserDefaults.standard.set(enabled, forKey: SystemScreenshotImporter.preferenceKey)
        syncSystemScreenshots()
        refresh()
    }

    private func applyCaptionSettings(_ patch: CaptionSettingsPatch) {
        let settings = patch.applying(to: overlay.settings())
        overlay.apply(settings)
        if session?.canCaptureImage == true, settings.enabled { overlay.show() }
        else if !settings.enabled { overlay.hide() }
        refresh()
    }

    /// Records one unattended meeting and writes down what every part of it did.
    ///
    /// The app has to be launched through LaunchServices for TCC to attribute
    /// permissions to it rather than to a terminal, which means stdout goes nowhere —
    /// so the report goes to a file next to the meetings.
    private func runDiagnosis(seconds: Double, runs: Int = 1) async {
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

        for run in 1...runs {
            if runs > 1 { report.append("  — meeting \(run) of \(runs) —") }

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
        }

        writeDiagnosis(report)
        NSApp.terminate(nil)
    }

    /// Read TCC from the signed app process without starting capture. This exists so a
    /// rebuilt bundle can prove which grants macOS attached to its designated identity.
    private func writePermissionReportAndQuit() async {
        var report = ["Excerpt permissions — \(Date().formatted())"]
        for permission in Permission.allCases {
            report.append("  \(permission.rawValue): \(await Permissions.state(of: permission).rawValue)")
        }
        try? report.joined(separator: "\n").appending("\n").write(
            to: URL(filePath: "/private/tmp/excerpt-permissions.txt"), atomically: true, encoding: .utf8)
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
        alert.informativeText = "Excerpt kept the transcript, screenshots and writing from the interrupted meeting. Recover the meeting to read them?"
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
        let wantsShortcuts = session?.canCaptureImage == true
        shortcuts.setMeetingActive(wantsShortcuts)
        if !wantsShortcuts {
            catchUp.close()
            if screenshotCapture.isCapturing { screenshotCapture.cancel() }
            screenshotWindowHandoff.restore()
        }
        screenshotItem?.isEnabled = session?.canCaptureImage == true && !screenshotCapture.isCapturing
        catchUpItem?.isEnabled = session?.canCaptureImage == true
        let listening = session?.state.isActive ?? false
        let captionsOn = overlay.captionsEnabled

        statusItem?.button?.image = Self.symbol(
            listening ? "captions.bubble.fill" : "captions.bubble", "Excerpt")
        let screenshotIssue = wantsShortcuts ? systemScreenshots.unavailableReason : nil
        statusLine?.title = (session?.status ?? "Not listening")
            + (screenshotIssue == nil ? "" : " · screenshot import unavailable")
        statusLine?.toolTip = screenshotIssue
        listenItem?.title = listening ? "End meeting" : "Start meeting"
        listenItem?.image = Self.symbol(listening ? "stop.circle" : "record.circle",
                                        listening ? "End meeting" : "Start meeting")
        captionsItem?.state = captionsOn ? .on : .off
        noticeItem?.state = noticesMeetings ? .on : .off
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

    /// Opening Excerpt again from Finder, Spotlight or the Dock while it runs brings
    /// back its window rather than doing nothing visible. Captions do not count as a
    /// window here; they are a layer over someone else's app.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let setup, setup.window?.isVisible == true {
            setup.present()
        } else if let session, session.state.isActive, !session.meetingId.isEmpty {
            notes?.navigate(toMeeting: session.meetingId)
        } else {
            notes?.reveal()
        }
        return false
    }

    /// AppKit asks synchronously, but capture finalization and the required store write
    /// are asynchronous. Return `.terminateLater`, let the main actor keep running,
    /// then reply. Optional enhancement is deliberately not awaited.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let requiresCleanup = session?.state.isActive == true || session?.canRetryFailedSave == true
            || commands?.isStarting == true || setupModel.inputCheck.running
        switch termination.request(
            requiresCleanup: requiresCleanup,
            cancelPendingUI: { [weak self] in
                self?.screenshotCapture.cancel()
                self?.screenshotWindowHandoff.restore()
                self?.catchUp.close()
            },
            cleanup: { [weak self] in
                guard let self else { return }
                await self.setupModel.inputCheck.stop()
                await self.commands?.end()
                guard let session = self.session else { return }
                if session.state.isActive { await session.stop() }
                if session.canRetryFailedSave { _ = try? session.retryFailedSave() }
            },
            reply: { allowed in NSApp.reply(toApplicationShouldTerminate: allowed) }) {
        case .terminateNow: return .terminateNow
        case .terminateLater: return .terminateLater
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        shortcuts.unregister()
        screenshotCapture.cancel()
        systemScreenshots.stop()
    }
}

extension AppDelegate: NSMenuDelegate {
    /// Marks and titles are set as the menu opens. There is no window in which the
    /// menu can be showing something that is no longer true.
    func menuNeedsUpdate(_ menu: NSMenu) {
        refresh()
        guard menu === statusItem?.menu || menu === lookMenu || menu === displayMenu || menu === shortcutMenu else { return }

        for item in lookMenu?.items ?? [] {
            if let raw = item.representedObject as? String {
                item.state = raw == overlay.preset.rawValue ? .on : .off
            }
            for child in item.submenu?.items ?? [] {
                guard let raw = child.representedObject as? String else { continue }
                child.state = (raw == overlay.size.rawValue || raw == overlay.position.rawValue) ? .on : .off
            }
        }

        displayMenu?.removeAllItems()
        for display in overlay.displays {
            let item = NSMenuItem(title: display.name, action: #selector(chooseDisplay(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = display.id
            item.state = display.id == overlay.selectedDisplayID ? .on : .off
            displayMenu?.addItem(item)
        }
        if overlay.displayMissing {
            let missing = NSMenuItem(title: "Selected display is disconnected — using the main display", action: nil, keyEquivalent: "")
            missing.isEnabled = false
            displayMenu?.addItem(missing)
        }
        displayMenu?.addItem(.separator())
        let move = NSMenuItem(title: "Move captions to this display", action: #selector(moveCaptionsToCurrentDisplay), keyEquivalent: "")
        move.target = self
        displayMenu?.addItem(move)

        shortcutMenu?.removeAllItems()
        for status in shortcuts.statuses() {
            let suffix = status.registered ? status.shortcut
                : status.relevant ? "Unavailable — use the menu" : "Available during a meeting"
            let item = NSMenuItem(title: "\(status.label) — \(suffix)", action: nil, keyEquivalent: "")
            item.isEnabled = false
            shortcutMenu?.addItem(item)
        }
    }
}

/// Lets the gate window reach the overlay the app owns.
@MainActor
final class OverlayBridge {
    static let shared = OverlayBridge()
    var controller: OverlayController?
}
