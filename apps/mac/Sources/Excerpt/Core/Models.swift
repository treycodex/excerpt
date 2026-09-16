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
    var originalText: String?
    var corrections: [TranscriptCorrection]?
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
    var completed: Bool?
    var confirmed: Bool?
    var needsReview: Bool?
    /// Which boost terms fired, filled in by `rank`. Not stored.
    var matched: [String]?
}

struct Preferences: Codable, Sendable, Equatable {
    var order: [Category]
    var boosts: [String]
    var instruction: String
    var transcriptionChoice: String?
    var notesProvider: String?

    static let `default` = Preferences(
        order: [.decision, .action, .deadline, .question],
        boosts: [],
        instruction: "",
        notesProvider: "apple"
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
    var notes: NotesDocument?
    var images: [MeetingImage]?
    /// Only title/document edits advance this. Speech and screenshots merge around it.
    var draftRevision: Int?
    /// Enhancement is reviewable and never replaces the user's current document.
    var suggestedNotes: NotesDocument?
    var sourceRevision: Int? = nil
}

struct NoteBullet: Codable, Sendable, Equatable, Identifiable {
    var id: String
    var text: String
    var evidence: [Evidence]
    var userEdited: Bool?
}

struct NoteTopic: Codable, Sendable, Equatable, Identifiable {
    var id: String
    var title: String
    var bullets: [NoteBullet]
}

struct NotesDocument: Codable, Sendable, Equatable {
    var version = 1
    var method: String
    /// Why these are the transcript-based notes. See `NotesDocument` in packages/types.
    var notice: String?
    var keyPoints: [NoteBullet]
    var topics: [NoteTopic]
    var blocks: [NoteBlock]?
    var deletedBlocks: [NoteBlock]? = nil
    var generation: NotesGeneration? = nil
}

struct NotesGeneration: Codable, Sendable, Equatable {
    var provider: String
    var model: String
    var generatedAt: String
    var sourceRevision: Int
    var style: String
}

struct NotesGenerationRequest: Codable, Sendable, Equatable {
    var style: String
}

/// What the notes window is allowed to offer, answered without making a request.
///
/// Whether a provider is *selected* and whether it can be *asked* are different
/// questions, and only the second one licenses an "Improve notes" button. Apple's
/// availability is a local property read; the OpenAI answer is whether a key exists
/// in Keychain. Neither costs anything, and neither sends a token anywhere.
struct NotesProviderStatus: Codable, Sendable, Equatable {
    var openAIKeyConfigured: Bool
    var selected: String
    var ready: Bool
    var reason: String?
    var providerName: String
    var processing: String
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

struct TranscriptCorrection: Codable, Sendable, Equatable {
    var text: String
    var correctedAt: String
}

struct MeetingImage: Codable, Sendable, Equatable, Identifiable {
    var id: String
    var dataUrl: String
    var capturedAt: String
    /// Original capture time. Moving the image block never changes this anchor.
    var at: Double
    var caption: String
    var origin: String? = nil
    var context: MeetingImageContext? = nil
    var needsReview: Bool? = nil
}

struct MeetingImageContext: Codable, Sendable, Equatable {
    var eventIds: [String]
    var startAt: Double
    var endAt: Double
}

struct NoteBlock: Codable, Sendable, Equatable, Identifiable {
    var id: String
    var kind: String
    var text: String
    var evidence: [Evidence]
    var at: Double?
    var imageId: String?
    var userEdited: Bool?
    var needsReview: Bool?
    var indent: Int?
}
