import Foundation

/// Swift mirrors of `packages/types`. The engine speaks JSON, so these are the
/// contract with it — and with the notes webview, which receives the same shapes.
///
/// They are `struct`s and `enum`s because a transcript event is data: no identity,
/// no sharing, no lifetime. Copying one is free of consequence, which is what makes
/// a meeting recoverable from a journal of them.

/// Who produced the audio. This says who SPOKE — never who was addressed.
enum SourceRole: String, Codable, Sendable {
    case you, remote
}

enum Category: String, Codable, Sendable, CaseIterable {
    case decision, action, deadline, question
}

enum ItemState: String, Codable, Sendable {
    case discussed, proposed, decided
}

enum Assignee: String, Codable, Sendable {
    case you, unassigned
}

/// Where transcription actually happened. Surfaced to the user, never hidden.
enum ProcessingMode: String, Codable, Sendable {
    case onDevice = "on-device"
    case cloud
    case demo
}

struct TranscriptEvent: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var sessionId: String
    var role: SourceRole
    var speakerLabel: String
    var text: String
    var isFinal: Bool
    /// Milliseconds since the meeting began, at the moment the result arrived.
    var tArrived: Double
    var confidence: Double?
    /// Audio-aligned seconds on the meeting clock. macOS reports these; the website
    /// cannot. Timing is audio-aligned where they exist and arrival-approximate where
    /// they do not.
    var tStart: Double?
    var tEnd: Double?
}

struct Evidence: Codable, Sendable, Equatable {
    var eventIds: [String]
    var tArrived: Double
    var quote: String
    var speakerLabel: String
    var tStart: Double?
}

struct Item: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var category: Category
    var state: ItemState
    /// An EXTRACTIVE span of a real sentence. Never generated, never rewritten.
    var title: String
    var evidence: [Evidence]
    var related: [String]?
    var assignee: Assignee
    var due: String?
    var salience: Double
    var userEdited: Bool?
    var dismissed: Bool?
    /// Which boost terms fired, filled in by `rank`. Not stored.
    var matched: [String]?
}

struct Preferences: Codable, Sendable, Equatable {
    var order: [Category]
    var boosts: [String]
    var instruction: String
    var transcriptionChoice: String?

    static let `default` = Preferences(
        order: [.decision, .action, .deadline, .question],
        boosts: [],
        instruction: ""
    )
}

struct Meeting: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var title: String
    var startedAt: String
    var endedAt: String?
    var processing: ProcessingMode
    var events: [TranscriptEvent]
    var items: [Item]
}

extension JSONEncoder {
    /// The webview and the engine both read these; key order does not matter but
    /// stable output makes a journal diffable and a test readable.
    static let excerpt: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }()
}

extension JSONDecoder {
    static let excerpt = JSONDecoder()
}
