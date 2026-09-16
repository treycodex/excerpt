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
        case listMeetings, loadMeeting, saveMeeting, deleteMeeting
        case loadPreferences, savePreferences, exportMarkdown, exportHTML, summarizeNotes
        case getNotesProviderStatus, configureOpenAIKey, removeOpenAIKey
    }

    private enum Failure: Error, LocalizedError {
        case unknownMethod(String)
        case badArguments(String)

        var errorDescription: String? {
            switch self {
            case .unknownMethod(let name): "Excerpt has no \(name)()"
            case .badArguments(let name): "\(name)() was called with the wrong arguments"
            }
        }
    }

    private let store: MeetingStore
    private let preferences: PreferencesStore
    private let activeMeeting: (String?) -> Meeting?
    private let ownsEditorWrites: (String) -> Bool
    private let updateActiveMeeting: (Meeting) throws -> Meeting
    private let log = Logger(subsystem: "com.excerpt.app", category: "bridge")
    var onMeetingChange: ((String) -> Void)?

    init(store: MeetingStore, preferences: PreferencesStore,
         activeMeeting: @escaping (String?) -> Meeting? = { _ in nil },
         ownsEditorWrites: @escaping (String) -> Bool = { _ in false },
         updateActiveMeeting: @escaping (Meeting) throws -> Meeting = { meeting in meeting }) {
        self.store = store
        self.preferences = preferences
        self.activeMeeting = activeMeeting
        self.ownsEditorWrites = ownsEditorWrites
        self.updateActiveMeeting = updateActiveMeeting
    }

    func publish(_ meeting: Meeting) {
        guard let encoded = try? json(meeting) else { return }
        onMeetingChange?(encoded)
    }

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
        listMeetings:    ()          => send('listMeetings', []),
        loadMeeting:     (id)        => send('loadMeeting', [id]),
        saveMeeting:     (meeting)   => send('saveMeeting', [JSON.stringify(meeting)]),
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
            return (try handle(method, arguments), nil)
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
    private func handle(_ method: Method, _ arguments: [Any]) throws -> Any? {
        switch method {
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
            var meetings = store.list()
            if let active = activeMeeting(nil) {
                meetings.removeAll { $0.id == active.id }
                meetings.insert(active, at: 0)
            }
            return try json(meetings)

        case .loadMeeting:
            guard let id = arguments.first as? String else { throw Failure.badArguments("loadMeeting") }
            if let active = activeMeeting(id) { return try json(active) }
            return (try? store.load(id: id)).flatMap { try? json($0) }

        case .saveMeeting:
            guard let body = arguments.first as? String,
                  let meeting = try? decode(Meeting.self, from: body) else {
                throw Failure.badArguments("saveMeeting")
            }
            if ownsEditorWrites(meeting.id) {
                return try json(updateActiveMeeting(meeting))
            }
            try store.save(meeting)
            publish(meeting)
            return try json(meeting)

        case .deleteMeeting:
            guard let id = arguments.first as? String else { throw Failure.badArguments("deleteMeeting") }
            if activeMeeting(id) != nil {
                throw Failure.badArguments("deleteMeeting: a live meeting cannot be deleted")
            }
            try store.delete(id: id)
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
            save(markdown: markdown, suggesting: filename, html: method == .exportHTML)
            return nil
        }
    }

    private func save(markdown: String, suggesting filename: String, html: Bool) {
        let panel = NSSavePanel()
        let suffix = html ? ".html" : ".md"
        panel.nameFieldStringValue = filename.hasSuffix(suffix) ? filename : "\(filename)\(suffix)"
        panel.canCreateDirectories = true
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            try? markdown.write(to: url, atomically: true, encoding: .utf8)
        }
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
