import Foundation
import OSLog

/// Applies optional generated notes through the same durable revision boundary as
/// editor mutations. A deleted meeting has no file to update, so late provider work
/// cannot recreate it.
@MainActor
final class MeetingEnhancer {
    typealias Summarize = @Sendable (Meeting, Preferences, NotesGenerationRequest) async throws -> NotesDocument
    typealias Fallback = (Meeting) throws -> NotesDocument
    typealias ShapeNotice = (Meeting) throws -> String
    typealias Compose = (Meeting, NotesDocument) throws -> NotesDocument

    private let store: MeetingStore
    private let preferences: PreferencesStore
    private let summarize: Summarize
    private let fallback: Fallback
    private let shapeNotice: ShapeNotice
    private let compose: Compose
    private let log = Logger(subsystem: "com.excerpt.app", category: "meeting-enhancement")
    private var tasks: [String: Task<Void, Never>] = [:]
    private var taskGenerationIDs: [String: String] = [:]
    private var invalidated: Set<String> = []

    init(
        store: MeetingStore,
        preferences: PreferencesStore,
        summarize: @escaping Summarize,
        fallback: @escaping Fallback,
        shapeNotice: @escaping ShapeNotice,
        compose: @escaping Compose = { _, document in document }
    ) {
        self.store = store
        self.preferences = preferences
        self.summarize = summarize
        self.fallback = fallback
        self.shapeNotice = shapeNotice
        self.compose = compose
    }

    convenience init(store: MeetingStore, preferences: PreferencesStore, engine: CoreEngine) {
        self.init(
            store: store,
            preferences: preferences,
            summarize: { meeting, preferences, request in
                try await NotesProviderCoordinator.summarize(
                    meeting, preferences: preferences, request: request)
            },
            fallback: { try engine.notes(for: $0) },
            shapeNotice: { try engine.shapeNotice(for: $0) },
            compose: { try engine.composeNotes(for: $0, wording: $1) })
    }

    @discardableResult
    func start(source: Meeting, onChange: @escaping (Meeting) -> Void) -> Task<Void, Never> {
        let generationID = source.generationStatus?.generationId ?? ""
        if let existing = tasks[source.id], taskGenerationIDs[source.id] == generationID {
            return existing
        }
        cancel(id: source.id, markCancelled: false)
        invalidated.remove(source.id)
        let task = Task { [weak self] in
            guard let self else { return }
            await self.run(source: source, onChange: onChange)
        }
        tasks[source.id] = task
        taskGenerationIDs[source.id] = generationID
        return task
    }

    func cancel(id: String, markCancelled: Bool = false) {
        tasks[id]?.cancel()
        tasks[id] = nil
        taskGenerationIDs[id] = nil
        invalidated.insert(id)
        guard markCancelled else { return }
        if let updated = try? store.update(id: id, { meeting in
            guard var status = meeting.generationStatus else { return }
            status.state = .cancelled
            meeting.generationStatus = status
        }) {
            // Callers that need publication cancel through session before teardown;
            // this state is principally recovery truth on disk.
            _ = updated
        }
    }

    private func run(source: Meeting, onChange: @escaping (Meeting) -> Void) async {
        let generationID = source.generationStatus?.generationId ?? UUID().uuidString
        let inputFingerprint = Self.inputFingerprint(source)
        defer {
            if taskGenerationIDs[source.id] == generationID {
                tasks[source.id] = nil
                taskGenerationIDs[source.id] = nil
            }
        }
        do {
            let latestSource = try store.load(id: source.id)
            guard latestSource.generationStatus?.generationId == generationID,
                  Self.inputFingerprint(latestSource) == inputFingerprint else { return }
            let running = try store.update(id: source.id) { meeting in
                meeting.generationStatus = NotesGenerationStatus(
                    state: .running, generationId: generationID,
                    sourceRevision: source.sourceRevision ?? 0,
                    inputFingerprint: inputFingerprint)
            }
            onChange(running)

            var document: NotesDocument
            var failureNotice: String?
            do {
                document = try await summarize(
                    source, preferences.load(), NotesGenerationRequest(style: "balanced"))
            } catch is CancellationError {
                return
            } catch {
                log.error("note enhancement unavailable: \(error.localizedDescription)")
                failureNotice = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                document = try fallback(source)
            }
            try Task.checkCancellation()
            guard !invalidated.contains(source.id) else { return }

            let shape = (try? shapeNotice(source)) ?? ""
            let notice = [shape, failureNotice].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            document.notice = notice.isEmpty ? nil : notice

            let updated = try store.update(id: source.id) { latest in
                guard latest.generationStatus?.generationId == generationID,
                      (latest.sourceRevision ?? 0) == (source.sourceRevision ?? 0),
                      Self.inputFingerprint(latest) == inputFingerprint else {
                    if latest.generationStatus?.generationId == generationID {
                        latest.generationStatus?.state = .cancelled
                        latest.generationStatus?.message = "The transcript changed before these notes finished."
                    }
                    return
                }
                if (latest.documentRevision ?? 0) != (source.documentRevision ?? 0) {
                    latest.suggestedNotes = document
                } else {
                    latest.notes = try compose(latest, document)
                    latest.suggestedNotes = nil
                }
                latest.documentRevision = (latest.documentRevision ?? 0) + 1
                latest.generationStatus = NotesGenerationStatus(
                    state: .ready, generationId: generationID,
                    sourceRevision: latest.sourceRevision ?? 0,
                    inputFingerprint: inputFingerprint)
            }
            guard !invalidated.contains(source.id) else { return }
            onChange(updated)
        } catch is CancellationError {
            return
        } catch {
            // A missing file is the expected result after deletion. Any other failure
            // leaves the last durable version intact and is visible in the log.
            if !invalidated.contains(source.id) {
                log.error("summary save failed; saved meeting remains intact: \(error.localizedDescription)")
                if let failed = try? store.update(id: source.id, { meeting in
                    meeting.generationStatus = NotesGenerationStatus(
                        state: .failed, generationId: generationID,
                        sourceRevision: meeting.sourceRevision ?? 0,
                        inputFingerprint: Self.inputFingerprint(meeting),
                        message: "Note enhancement could not be saved.")
                }) { onChange(failed) }
            }
        }
    }

    static func inputFingerprint(_ meeting: Meeting) -> String {
        let transcript = meeting.events.map { "\($0.id):\($0.text)" }.joined(separator: "|")
        let moments = (meeting.images ?? []).map {
            "\($0.id):\($0.caption):\($0.anchorAt.map { String($0) } ?? ""):\($0.timeKnown.map { String($0) } ?? "")"
        }.joined(separator: "|")
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in "\(meeting.sourceRevision ?? 0)|\(transcript)|\(moments)".utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}
