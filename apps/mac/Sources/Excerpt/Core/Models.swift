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
    /// Item ids the reader has said this is not the same thing as. Separate from
    /// `userEdited`, which would claim the item had been hand-corrected.
    var unrelated: [String]?
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
    /// Additive native persistence metadata. Missing values remain valid legacy data.
    var schemaVersion: Int? = nil
    var revision: Int? = nil
    var documentRevision: Int? = nil
    var appliedOperationIds: [String]? = nil
    var generationStatus: NotesGenerationStatus? = nil
    /// Why capture ended. Optional so every meeting written before Phase 2 still decodes.
    var finishReason: MeetingFinishReason? = nil
    /// The native capture failure that caused an interrupted finish, when there was one.
    var captureError: String? = nil
}

enum MeetingFinishReason: String, Codable, Sendable, Equatable {
    case stopped, interrupted, recovered
}

struct NotesGenerationStatus: Codable, Sendable, Equatable {
    enum State: String, Codable, Sendable { case queued, running, ready, failed, cancelled }
    var state: State
    var generationId: String
    var sourceRevision: Int
    var inputFingerprint: String? = nil
    var message: String? = nil
}

enum MeetingChange: Codable, Sendable, Equatable {
    case create(meeting: Meeting)
    case setTitle(title: String)
    case setDocument(document: NotesDocument?, suggestedNotes: NotesDocument?)
    case setReviewItems(items: [Item])
    case correctTranscript(events: [TranscriptEvent], items: [Item], document: NotesDocument?,
                           suggestedNotes: NotesDocument?, images: [MeetingImage], sourceRevision: Int)
    case addImages(images: [MeetingImage], blocks: [NoteBlock])
    case updateImage(imageId: String, caption: String, needsReview: Bool?, blockText: String)

    private enum CodingKeys: String, CodingKey {
        case type, meeting, title, document, suggestedNotes, items, events, images
        case sourceRevision, blocks, imageId, caption, needsReview, blockText
    }
    private enum Kind: String, Codable {
        case create, setTitle, setDocument, setReviewItems, correctTranscript, addImages, updateImage
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(Kind.self, forKey: .type) {
        case .create:
            self = .create(meeting: try values.decode(Meeting.self, forKey: .meeting))
        case .setTitle:
            self = .setTitle(title: try values.decode(String.self, forKey: .title))
        case .setDocument:
            self = .setDocument(
                document: try values.decodeIfPresent(NotesDocument.self, forKey: .document),
                suggestedNotes: try values.decodeIfPresent(NotesDocument.self, forKey: .suggestedNotes))
        case .setReviewItems:
            self = .setReviewItems(items: try values.decode([Item].self, forKey: .items))
        case .correctTranscript:
            self = .correctTranscript(
                events: try values.decode([TranscriptEvent].self, forKey: .events),
                items: try values.decode([Item].self, forKey: .items),
                document: try values.decodeIfPresent(NotesDocument.self, forKey: .document),
                suggestedNotes: try values.decodeIfPresent(NotesDocument.self, forKey: .suggestedNotes),
                images: try values.decode([MeetingImage].self, forKey: .images),
                sourceRevision: try values.decode(Int.self, forKey: .sourceRevision))
        case .addImages:
            self = .addImages(
                images: try values.decode([MeetingImage].self, forKey: .images),
                blocks: try values.decode([NoteBlock].self, forKey: .blocks))
        case .updateImage:
            self = .updateImage(
                imageId: try values.decode(String.self, forKey: .imageId),
                caption: try values.decode(String.self, forKey: .caption),
                needsReview: try values.decodeIfPresent(Bool.self, forKey: .needsReview),
                blockText: try values.decode(String.self, forKey: .blockText))
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .create(let meeting):
            try values.encode(Kind.create, forKey: .type)
            try values.encode(meeting, forKey: .meeting)
        case .setTitle(let title):
            try values.encode(Kind.setTitle, forKey: .type)
            try values.encode(title, forKey: .title)
        case .setDocument(let document, let suggestedNotes):
            try values.encode(Kind.setDocument, forKey: .type)
            try values.encodeIfPresent(document, forKey: .document)
            try values.encodeIfPresent(suggestedNotes, forKey: .suggestedNotes)
        case .setReviewItems(let items):
            try values.encode(Kind.setReviewItems, forKey: .type)
            try values.encode(items, forKey: .items)
        case .correctTranscript(let events, let items, let document, let suggestedNotes, let images, let sourceRevision):
            try values.encode(Kind.correctTranscript, forKey: .type)
            try values.encode(events, forKey: .events)
            try values.encode(items, forKey: .items)
            try values.encodeIfPresent(document, forKey: .document)
            try values.encodeIfPresent(suggestedNotes, forKey: .suggestedNotes)
            try values.encode(images, forKey: .images)
            try values.encode(sourceRevision, forKey: .sourceRevision)
        case .addImages(let images, let blocks):
            try values.encode(Kind.addImages, forKey: .type)
            try values.encode(images, forKey: .images)
            try values.encode(blocks, forKey: .blocks)
        case .updateImage(let imageId, let caption, let needsReview, let blockText):
            try values.encode(Kind.updateImage, forKey: .type)
            try values.encode(imageId, forKey: .imageId)
            try values.encode(caption, forKey: .caption)
            try values.encodeIfPresent(needsReview, forKey: .needsReview)
            try values.encode(blockText, forKey: .blockText)
        }
    }
}

struct MeetingMutation: Codable, Sendable, Equatable {
    var operationId: String
    var meetingId: String
    var baseRevision: Int
    var baseDocumentRevision: Int
    var baseSourceRevision: Int
    var changes: [MeetingChange]
}

struct MeetingMutationAcknowledgment: Codable, Sendable, Equatable {
    enum Status: String, Codable, Sendable { case applied, rebased, duplicate, conflict }
    var operationId: String
    var meetingId: String
    var status: Status
    var revision: Int
    var documentRevision: Int
    var sourceRevision: Int
    var meeting: Meeting
    var message: String? = nil
}

enum ExportOutcome: String, Codable, Sendable { case saved, cancelled }

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
