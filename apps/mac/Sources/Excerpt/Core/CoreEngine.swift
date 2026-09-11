import Foundation
import JavaScriptCore

/// Hosts `excerpt-engine.js` — the same bundle the website compiles from — inside
/// JavaScriptCore.
///
/// The reason this is not a Swift port: what counts as a decision, what may be
/// called an action assigned to you, and where a subtitle breaks are the judgements
/// the whole product's trustworthiness rests on. Two implementations means two sets
/// of behaviour and one set of fixtures pretending to cover both. One bundle, two
/// runtimes, and `ExcerptTests` runs the same cases against it that vitest runs
/// against the source.
///
/// Main-actor by choice, not by accident: `JSContext` is not thread-safe, the calls
/// are short, and the overlay needs line breaking on the frame it draws. If a long
/// meeting ever makes end-of-meeting extraction visible, that one call moves off —
/// not the whole class.
@MainActor
final class CoreEngine {

    enum Failure: Error, LocalizedError {
        case bundleMissing
        case contextUnavailable
        case scriptFailed(String)
        case globalMissing
        case versionMismatch(found: String, expected: String)
        case callFailed(String)

        var errorDescription: String? {
            switch self {
            case .bundleMissing:
                "The notes engine is missing from the app bundle."
            case .contextUnavailable:
                "JavaScriptCore could not start."
            case .scriptFailed(let message):
                "The notes engine failed to load: \(message)"
            case .globalMissing:
                "The notes engine loaded but defined nothing."
            case .versionMismatch(let found, let expected):
                "The notes engine is version \(found); this app expects \(expected). Rebuild it with `pnpm --filter @excerpt/core build:engine`."
            case .callFailed(let message):
                "The notes engine failed: \(message)"
            }
        }
    }

    /// Bumped in `packages/core/src/engine.ts` whenever the contract changes, so a
    /// stale bundle fails loudly at launch instead of quietly at the first meeting.
    private static let expectedVersion = "2"

    private let context: JSContext
    private let engine: JSValue

    convenience init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "excerpt-engine", withExtension: "js") else {
            throw Failure.bundleMissing
        }
        try self.init(engineURL: url)
    }

    /// Loads from an explicit file, which is how the parity tests reach the bundle
    /// without an app around them.
    init(engineURL url: URL) throws {
        guard let source = try? String(contentsOf: url, encoding: .utf8) else {
            throw Failure.bundleMissing
        }
        guard let context = JSContext() else { throw Failure.contextUnavailable }

        // JavaScriptCore reports a syntax error by leaving `exception` set and
        // returning undefined, not by throwing. Without this hook a broken bundle
        // looks exactly like a working one until the first call returns nothing.
        var thrown: String?
        context.exceptionHandler = { _, exception in
            thrown = exception?.toString() ?? "unknown JavaScript error"
        }

        context.evaluateScript(source, withSourceURL: url)
        if let thrown { throw Failure.scriptFailed(thrown) }

        guard let engine = context.objectForKeyedSubscript("Excerpt"), !engine.isUndefined else {
            throw Failure.globalMissing
        }
        let version = engine.objectForKeyedSubscript("version")?.toString() ?? "?"
        guard version == Self.expectedVersion else {
            throw Failure.versionMismatch(found: version, expected: Self.expectedVersion)
        }

        self.context = context
        self.engine = engine
        context.exceptionHandler = { _, exception in
            // Past the constructor an exception belongs to one call, and `call`
            // surfaces it there. Keeping a handler installed stops JSC logging to
            // stderr and vanishing.
            thrown = exception?.toString()
        }
    }

    // MARK: - The engine's surface

    /// Items from finalized transcript events.
    ///
    /// `reference` decides what "Thursday" means, and it is the meeting's own start
    /// rather than now — otherwise re-opening an old meeting silently reinterprets
    /// its deadlines against today's calendar.
    func extract(events: [TranscriptEvent], reference: Date) throws -> [Item] {
        let json = try String(decoding: JSONEncoder.excerpt.encode(events), as: UTF8.self)
        let out = try call("extract", [json, ISO8601DateFormatter().string(from: reference)])
        return try decode([Item].self, from: out)
    }

    /// Ordering by what the user said they care about. Never filtering: an item is
    /// not hidden because it was not asked for.
    func rank(_ items: [Item], preferences: Preferences) throws -> [Item] {
        let itemsJSON = try String(decoding: JSONEncoder.excerpt.encode(items), as: UTF8.self)
        let prefsJSON = try String(decoding: JSONEncoder.excerpt.encode(preferences), as: UTF8.self)
        let out = try call("rank", [itemsJSON, prefsJSON])
        return try decode([Item].self, from: out)
    }

    func boosts(for instruction: String) throws -> [String] {
        try decode([String].self, from: call("boostsFor", [instruction]))
    }

    /// Phrase-aware subtitle breaking — the same routine the website's captions use,
    /// which is why the overlay does not carry a second one that drifts.
    func subtitleLines(_ text: String, maxChars: Int) throws -> [String] {
        try decode([String].self, from: call("subtitleLines", [text, maxChars]))
    }

    /// The extractive notes document: excerpts of what was said, with the quote each
    /// one came from. This is the website's long-standing fallback, and the Mac's
    /// only notes when the optional on-device summary is unavailable or produces
    /// nothing a quote supports.
    func notes(for meeting: Meeting) throws -> NotesDocument {
        let json = try String(decoding: JSONEncoder.excerpt.encode(meeting), as: UTF8.self)
        return try decode(NotesDocument.self, from: call("notes", [json]))
    }

    /// What kind of recording this is, when it is not the kind Excerpt is for — one
    /// voice throughout, which is a talk rather than a conversation. Empty when there
    /// is nothing worth saying. Shared with the website so the two cannot disagree.
    func shapeNotice(for meeting: Meeting) throws -> String {
        let json = try String(decoding: JSONEncoder.excerpt.encode(meeting), as: UTF8.self)
        return try call("shapeNotice", [json])
    }

    func markdown(for meeting: Meeting) throws -> String {
        let json = try String(decoding: JSONEncoder.excerpt.encode(meeting), as: UTF8.self)
        return try call("markdown", [json])
    }

    // MARK: - Bridging

    private func call(_ name: String, _ arguments: [Any]) throws -> String {
        var thrown: String?
        context.exceptionHandler = { _, exception in thrown = exception?.toString() }

        guard let function = engine.objectForKeyedSubscript(name), !function.isUndefined else {
            throw Failure.callFailed("the engine has no \(name)()")
        }
        let result = function.call(withArguments: arguments)
        if let thrown { throw Failure.callFailed("\(name): \(thrown)") }
        guard let string = result?.toString() else {
            throw Failure.callFailed("\(name) returned nothing")
        }
        return string
    }

    private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
        guard let data = json.data(using: .utf8) else {
            throw Failure.callFailed("the engine returned text that is not UTF-8")
        }
        return try JSONDecoder.excerpt.decode(type, from: data)
    }
}
