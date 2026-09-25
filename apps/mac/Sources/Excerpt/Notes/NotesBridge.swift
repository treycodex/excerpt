import AppKit
import Foundation
import OSLog
import WebKit

/// The native half of `packages/core/src/store/bridge.ts`.
///
/// The editor receives settled meeting snapshots. Live captions remain native, while
/// title/document writes are merged by MeetingSession so they cannot replace speech
/// or screenshots that arrived after the webview loaded.
@MainActor
final class NotesBridge: NSObject {

    /// Names the JavaScript side calls. Matching an unknown one is an error the
    /// webview should see, not a silent undefined.
    private enum Method: String {
        case startMeeting, openLiveNotes, getLiveMeetingTime, retryAutomaticNotes, listMeetings, searchMeetings, loadMeeting, mutateMeeting, renameMeeting, deleteMeeting
        case loadPreferences, savePreferences, exportMarkdown, exportHTML, summarizeNotes
        case getNotesProviderStatus, configureOpenAIKey, removeOpenAIKey
        case loadDesktopSettings, saveCaptionSettings, selectMicrophone
    }

    private enum Failure: Error, LocalizedError {
        case unknownMethod(String)
        case badArguments(String)
        case noLiveMeeting

        var errorDescription: String? {
            switch self {
            case .unknownMethod(let name): "Excerpt has no \(name)()"
            case .badArguments(let name): "\(name)() was called with the wrong arguments"
            case .noLiveMeeting: "That meeting is no longer listening. Open the saved notes and add the image there."
            }
        }
    }

    private let store: MeetingStore
    private let preferences: PreferencesStore
    private let activeMeeting: (String?) -> Meeting?
    private let mutateLiveMeeting: (MeetingMutation) throws -> MeetingMutationAcknowledgment?
    private let didDeleteMeeting: (String) -> Void
    private let startMeetingAction: () async throws -> Void
    private let openLiveNotesAction: () -> Void
    private let liveMeetingTime: (String) -> Double?
    private let retryAutomaticNotesAction: (String) throws -> Meeting
    private let desktopSettings: () -> DesktopSettings
    private let saveCaptionSettingsAction: (CaptionSettingsPatch) throws -> Void
    private let selectMicrophoneAction: (String) throws -> Void
    private let exporter: any NotesExporting
    private let log = Logger(subsystem: "com.excerpt.app", category: "bridge")
    private var suppressEditorEcho = false
    var onMeetingChange: ((String) -> Void)?

    init(store: MeetingStore, preferences: PreferencesStore,
         activeMeeting: @escaping (String?) -> Meeting? = { _ in nil },
         mutateLiveMeeting: @escaping (MeetingMutation) throws -> MeetingMutationAcknowledgment? = { _ in nil },
         didDeleteMeeting: @escaping (String) -> Void = { _ in },
         startMeeting: @escaping () async throws -> Void = {},
         openLiveNotes: @escaping () -> Void = {},
         liveMeetingTime: @escaping (String) -> Double? = { _ in nil },
         retryAutomaticNotes: @escaping (String) throws -> Meeting = { _ in throw Failure.noLiveMeeting },
         desktopSettings: @escaping () -> DesktopSettings = {
             DesktopSettings(
                captions: CaptionSettings(preset: .classic, size: .medium, position: .standard,
                    enabled: true, displayId: "", displays: [], displayMissing: true,
                    displayName: "No display"),
                microphone: MicrophoneSettings(selectedDeviceId: "", devices: [], health: .missing,
                    message: "No microphone is connected."), shortcuts: [])
         },
         saveCaptionSettings: @escaping (CaptionSettingsPatch) throws -> Void = { _ in },
         selectMicrophone: @escaping (String) throws -> Void = { _ in },
         exporter: (any NotesExporting)? = nil) {
        self.store = store
        self.preferences = preferences
        self.activeMeeting = activeMeeting
        self.mutateLiveMeeting = mutateLiveMeeting
        self.didDeleteMeeting = didDeleteMeeting
        self.startMeetingAction = startMeeting
        self.openLiveNotesAction = openLiveNotes
        self.liveMeetingTime = liveMeetingTime
        self.retryAutomaticNotesAction = retryAutomaticNotes
        self.desktopSettings = desktopSettings
        self.saveCaptionSettingsAction = saveCaptionSettings
        self.selectMicrophoneAction = selectMicrophone
        self.exporter = exporter ?? NativeNotesExporter()
    }

    func publish(_ meeting: Meeting) {
        guard !suppressEditorEcho else { return }
        guard let encoded = try? json(meeting) else { return }
        onMeetingChange?(encoded)
    }

    func publishDesktopSettings() {
        guard let encoded = try? json(desktopSettings()) else { return }
        onDesktopSettingsChange?(encoded)
    }

    var onDesktopSettingsChange: ((String) -> Void)?

    /// The JavaScript side of the seam. Installed at document start so the React app
    /// can find `__excerptBridge` before its first render — `packages/core` checks for
    /// it synchronously, and a bridge that appears later is a bridge that is missed.
    static let installScript = """
    (function () {
      // Values cross as JSON strings — one bridging surface instead of a dictionary
      // shape that can quietly disagree with the TypeScript type. Which means this
      // side has to parse them: without it `listMeetings()` resolves to a string and
      // the library view maps over characters.
      const send = async (method, args) => {
        const reply = await window.webkit.messageHandlers.excerpt.postMessage({ method, args });
        if (typeof reply !== 'string') return reply ?? undefined;
        try { return JSON.parse(reply); } catch { return undefined; }
      };
      globalThis.__excerptBridge = {
        startMeeting:     ()          => send('startMeeting', []),
        openLiveNotes:    ()          => send('openLiveNotes', []),
        getLiveMeetingTime: (id)      => send('getLiveMeetingTime', [id]),
        retryAutomaticNotes: (id)      => send('retryAutomaticNotes', [id]),
        loadDesktopSettings: ()       => send('loadDesktopSettings', []),
        saveCaptionSettings: (value)  => send('saveCaptionSettings', [JSON.stringify(value)]),
        selectMicrophone: (deviceId)  => send('selectMicrophone', [deviceId]),
        listMeetings:    ()          => send('listMeetings', []),
        searchMeetings:  (query)     => send('searchMeetings', [query]),
        renameMeeting:  (id, title) => send('renameMeeting', [id, title]),
        loadMeeting:     (id)        => send('loadMeeting', [id]),
        mutateMeeting:   (mutation)  => send('mutateMeeting', [JSON.stringify(mutation)]),
        deleteMeeting:   (id)        => send('deleteMeeting', [id]),
        loadPreferences: ()          => send('loadPreferences', []),
        savePreferences: (prefs)     => send('savePreferences', [JSON.stringify(prefs)]),
        exportMarkdown:  (name, md)  => send('exportMarkdown', [name, md]),
        exportHTML:      (name, html) => send('exportHTML', [name, html]),
        summarizeNotes:  (meeting, request) => send('summarizeNotes', [JSON.stringify(meeting), JSON.stringify(request)]),
        getNotesProviderStatus: ()   => send('getNotesProviderStatus', []),
        configureOpenAIKey: ()       => send('configureOpenAIKey', []),
        removeOpenAIKey: ()          => send('removeOpenAIKey', []),
      };
      globalThis.__excerptReceiveMeeting = (json) => {
        try {
          window.dispatchEvent(new CustomEvent('excerpt:meeting', { detail: JSON.parse(json) }));
        } catch (_) { /* a malformed native update is ignored; the saved copy remains */ }
      };
      globalThis.__excerptReceiveDesktopSettings = (json) => {
        try {
          window.dispatchEvent(new CustomEvent('excerpt:desktop-settings', { detail: JSON.parse(json) }));
        } catch (_) { /* native remains authoritative if an update is malformed */ }
      };
      globalThis.__excerptNative = true;
      // Marked on the root element, at document start, so the first paint already
      // knows it is in a window with a transparent title bar over it.
      document.documentElement.dataset.host = 'mac';
    })();
    """
}

extension NotesBridge: WKScriptMessageHandlerWithReply {
    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        guard let payload = message.body as? [String: Any],
              let name = payload["method"] as? String else {
            return (nil, "the bridge was called with no method")
        }
        let arguments = payload["args"] as? [Any] ?? []

        do {
            guard let method = Method(rawValue: name) else { throw Failure.unknownMethod(name) }
            if method == .summarizeNotes {
                guard arguments.count == 2,
                      let body = arguments[0] as? String,
                      let requestBody = arguments[1] as? String else { throw Failure.badArguments(name) }
                let meeting = try decode(Meeting.self, from: body)
                let request = try decode(NotesGenerationRequest.self, from: requestBody)
                return (try await json(NotesProviderCoordinator.summarize(
                    meeting, preferences: preferences.load(), request: request)), nil)
            }
            return (try await dispatch(name, arguments: arguments), nil)
        } catch {
            log.error("bridge \(name) failed: \(error.localizedDescription)")
            return (nil, NotesBridge.readable(error))
        }
    }

    /// What to put on screen when something fails.
    ///
    /// Every error was handed over verbatim, so a reader once met "Failed to
    /// deserialize a Generable type from model output" above their notes — a
    /// sentence about a framework's internals, in a product that otherwise says
    /// one line in the user's words. Errors written for people are kept; the rest
    /// are replaced, and the detail stays in the log above rather than being lost.
    nonisolated static func readable(_ error: Error) -> String {
        if let described = (error as? LocalizedError)?.errorDescription { return described }
        if error is CancellationError { return "That was cancelled." }
        return "Something went wrong on this Mac and the notes were left as they are. "
            + "Your transcript is unchanged."
    }

    /// Values cross as JSON strings, decoded by the webview. One bridging surface
    /// rather than a dictionary shape that can quietly disagree with the TypeScript type.
    func dispatch(_ name: String, arguments: [Any] = []) async throws -> Any? {
        guard let method = Method(rawValue: name) else { throw Failure.unknownMethod(name) }
        return try await handle(method, arguments)
    }

    private func handle(_ method: Method, _ arguments: [Any]) async throws -> Any? {
        switch method {
        case .startMeeting:
            try await performStartMeeting()
            return nil
        case .openLiveNotes:
            performOpenLiveNotes()
            return nil
        case .getLiveMeetingTime:
            guard let id = arguments.first as? String else { throw Failure.badArguments("getLiveMeetingTime") }
            guard let position = liveMeetingTime(id) else { throw Failure.noLiveMeeting }
            return try json(position)
        case .retryAutomaticNotes:
            guard let id = arguments.first as? String else { throw Failure.badArguments("retryAutomaticNotes") }
            return try json(retryAutomaticNotesAction(id))
        case .loadDesktopSettings:
            return try json(desktopSettings())
        case .saveCaptionSettings:
            guard let body = arguments.first as? String,
                  let settings = try? decode(CaptionSettingsPatch.self, from: body) else {
                throw Failure.badArguments("saveCaptionSettings")
            }
            try saveCaptionSettingsAction(settings)
            let snapshot = desktopSettings()
            publishDesktopSettings()
            return try json(snapshot)
        case .selectMicrophone:
            guard let id = arguments.first as? String else {
                throw Failure.badArguments("selectMicrophone")
            }
            try selectMicrophoneAction(id)
            let snapshot = desktopSettings()
            publishDesktopSettings()
            return try json(snapshot)
        case .summarizeNotes:
            throw Failure.badArguments("summarizeNotes")
        case .getNotesProviderStatus:
            return try json(NotesProviderCoordinator.status(preferences: preferences.load()))

        case .configureOpenAIKey:
            if let key = promptForOpenAIKey() { try OpenAIKeyStore.save(key) }
            return try json(NotesProviderCoordinator.status(preferences: preferences.load()))

        case .removeOpenAIKey:
            try OpenAIKeyStore.remove()
            return nil
        case .listMeetings:
            return try json(orderedLibraryRecords().map(\.entry))

        case .searchMeetings:
            guard let query = arguments.first as? String else { throw Failure.badArguments("searchMeetings") }
            return try json(MeetingLibrarySearch.searchRecords(orderedLibraryRecords(), query: query))

        case .loadMeeting:
            guard let id = arguments.first as? String else { throw Failure.badArguments("loadMeeting") }
            if let active = activeMeeting(id) { return try json(active) }
            guard store.contains(id: id) else { return nil }
            return try json(store.load(id: id))

        case .mutateMeeting:
            guard let body = arguments.first as? String,
                  let mutation = try? decode(MeetingMutation.self, from: body) else {
                throw Failure.badArguments("mutateMeeting")
            }
            var acknowledgment = try applyMutation(mutation, publishChange: false)
            if acknowledgment.status == .applied, let images = acknowledgment.meeting.images,
               !images.isEmpty {
                acknowledgment.imageDataOmitted = true
                acknowledgment.meeting.images = images.map { image in
                    var compact = image
                    compact.dataUrl = ""
                    return compact
                }
            }
            return try json(acknowledgment)

        case .renameMeeting:
            guard arguments.count == 2, let id = arguments[0] as? String,
                  let title = arguments[1] as? String else {
                throw Failure.badArguments("renameMeeting")
            }
            let current = try activeMeeting(id) ?? store.load(id: id)
            let mutation = MeetingMutation(operationId: UUID().uuidString, meetingId: id,
                baseRevision: current.revision ?? current.draftRevision ?? 0,
                baseDocumentRevision: current.documentRevision ?? current.draftRevision ?? 0,
                baseSourceRevision: current.sourceRevision ?? 0,
                changes: [.setTitle(title: title)])
            let acknowledged = try applyMutation(mutation, publishChange: false)
            return try json(MeetingLibraryEntry(acknowledged.meeting))

        case .deleteMeeting:
            guard let id = arguments.first as? String else { throw Failure.badArguments("deleteMeeting") }
            try deleteMeeting(id)
            return nil

        case .loadPreferences:
            return try json(preferences.load())

        case .savePreferences:
            guard let body = arguments.first as? String,
                  let prefs = try? decode(Preferences.self, from: body) else {
                throw Failure.badArguments("savePreferences")
            }
            preferences.save(prefs)
            return nil

        case .exportMarkdown, .exportHTML:
            guard arguments.count == 2,
                  let filename = arguments[0] as? String,
                  let markdown = arguments[1] as? String else {
                throw Failure.badArguments("exportMarkdown")
            }
            // A real save panel, not a browser download: a file:// webview's download
            // goes nowhere the user can find, which reads as the export having failed.
            return try json(await export(
                contents: markdown, suggesting: filename, html: method == .exportHTML))
        }
    }

    private func orderedLibraryRecords() -> [MeetingLibraryRecord] {
        var meetings = store.libraryRecords()
        if let active = activeMeeting(nil) {
            meetings.removeAll { $0.entry.id == active.id }
            meetings.insert(MeetingLibraryRecord(active), at: 0)
        }
        return meetings
    }

    @discardableResult
    func applyMutation(_ mutation: MeetingMutation, publishChange: Bool = true) throws -> MeetingMutationAcknowledgment {
        let priorSuppression = suppressEditorEcho
        if !publishChange { suppressEditorEcho = true }
        defer { suppressEditorEcho = priorSuppression }
        let acknowledgment: MeetingMutationAcknowledgment
        if let live = try mutateLiveMeeting(mutation) { acknowledgment = live }
        else { acknowledgment = try store.apply(mutation) }
        if publishChange && acknowledgment.status != .conflict { publish(acknowledgment.meeting) }
        return acknowledgment
    }

    /// Explicit operations exposed to the bundled editor. Keeping them here makes
    /// the UI bridge testable without a browser or an alternative capture path.
    func performStartMeeting() async throws { try await startMeetingAction() }
    func performOpenLiveNotes() { openLiveNotesAction() }

    func deleteMeeting(_ id: String) throws {
        if activeMeeting(id) != nil {
            throw Failure.badArguments("deleteMeeting: a live meeting cannot be deleted")
        }
        try store.delete(id: id)
        didDeleteMeeting(id)
    }

    func export(contents: String, suggesting filename: String, html: Bool) async throws -> ExportOutcome {
        try await exporter.export(contents: contents, suggesting: filename, html: html)
    }

    /// Credentials are entered in a native secure field. The notes webview receives
    /// only the resulting configured/not-configured status.
    private func promptForOpenAIKey() -> String? {
        let alert = NSAlert()
        alert.messageText = OpenAIKeyStore.exists() ? "Replace OpenAI API key" : "Add OpenAI API key"
        alert.informativeText = "Excerpt stores this key in macOS Keychain. It is used only when OpenAI note enhancement is selected."
        alert.addButton(withTitle: "Save key")
        alert.addButton(withTitle: "Cancel")
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24))
        field.placeholderString = "sk-…"
        alert.accessoryView = field
        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let key = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return key.isEmpty ? nil : key
    }

    private func json<T: Encodable>(_ value: T) throws -> String {
        try String(decoding: JSONEncoder.excerpt.encode(value), as: UTF8.self)
    }

    private func decode<T: Decodable>(_ type: T.Type, from string: String) throws -> T {
        try JSONDecoder.excerpt.decode(type, from: Data(string.utf8))
    }
}

@MainActor
protocol NotesExporting {
    func export(contents: String, suggesting filename: String, html: Bool) async throws -> ExportOutcome
}

@MainActor
final class NativeNotesExporter: NotesExporting {
    func export(contents: String, suggesting filename: String, html: Bool) async throws -> ExportOutcome {
        let panel = NSSavePanel()
        let suffix = html ? ".html" : ".md"
        panel.nameFieldStringValue = filename.hasSuffix(suffix) ? filename : "\(filename)\(suffix)"
        panel.canCreateDirectories = true
        let response = await withCheckedContinuation { continuation in
            panel.begin { continuation.resume(returning: $0) }
        }
        guard response == .OK, let url = panel.url else { return .cancelled }
        try contents.write(to: url, atomically: true, encoding: .utf8)
        return .saved
    }
}

/// Preferences on the Mac. Small enough for `UserDefaults`, and putting them there
/// rather than in the meetings folder keeps that folder to what the user would
/// expect to find in it: their meetings.
@MainActor
final class PreferencesStore {
    private let key = "excerpt.preferences"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func load() -> Preferences {
        guard let data = defaults.data(forKey: key),
              let preferences = try? JSONDecoder.excerpt.decode(Preferences.self, from: data) else {
            return .default
        }
        return preferences
    }

    func save(_ preferences: Preferences) {
        guard let data = try? JSONEncoder.excerpt.encode(preferences) else { return }
        defaults.set(data, forKey: key)
    }
}
