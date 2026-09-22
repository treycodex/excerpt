import Foundation
import OSLog

/// Meetings on disk, plus the journal that makes an interrupted one recoverable.
///
/// ```
/// ~/Library/Application Support/Excerpt/
///   meetings/<id>.json     the finished meeting
///   journal/<id>.ndjson    one settled transcript event per line, written as it settles
///   journal/<id>.draft.json  title, document, images and the latest merged snapshot
/// ```
///
/// The journal is the point. Gate 12 is not negotiable — an interruption may stop
/// capture, but it must never silently lose what was already transcribed — and a
/// meeting held only in memory until Stop loses everything to a crash, a panic, or
/// a battery. One line, appended and flushed the moment a result settles, costs
/// nothing and turns that from data loss into a recovery prompt.
@MainActor
final class MeetingStore {

    /// Deterministic failures for integration tests. Production leaves every hook
    /// nil and uses the same filesystem path below.
    struct Faults {
        var beforeWrite: ((URL) throws -> Void)?
        var beforeRemove: ((URL) throws -> Void)?
        var beforeJournalAppend: ((URL) throws -> Void)?
    }

    enum Failure: Error, LocalizedError {
        case directoryUnavailable(String)

        var errorDescription: String? {
            switch self {
            case .directoryUnavailable(let path):
                "Excerpt could not use its folder at \(path)."
            }
        }
    }

    private let root: URL
    private let meetingsDirectory: URL
    private let journalDirectory: URL
    private let log = Logger(subsystem: "com.excerpt.app", category: "store")
    private let faults: Faults

    /// Open journals, kept so an append does not reopen the file per line.
    private var handles: [String: FileHandle] = [:]

    init(root: URL? = nil, faults: Faults = Faults()) throws {
        let base = try root ?? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "Excerpt")

        self.root = base
        self.faults = faults
        meetingsDirectory = base.appending(path: "meetings")
        journalDirectory = base.appending(path: "journal")

        for directory in [base, meetingsDirectory, journalDirectory] {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            } catch {
                throw Failure.directoryUnavailable(directory.path(percentEncoded: false))
            }
        }
    }

    // MARK: - Meetings

    func save(_ meeting: Meeting) throws {
        let durable = meeting.revisioned()
        let data = try JSONEncoder.excerpt.encode(durable)
        // Atomic: a meeting half-written by a crash is worse than one not written,
        // because it looks complete in the library.
        let destination = url(forMeeting: durable.id)
        try faults.beforeWrite?(destination)
        try data.write(to: destination, options: .atomic)
    }

    func load(id: String) throws -> Meeting {
        try JSONDecoder.excerpt.decode(Meeting.self, from: Data(contentsOf: url(forMeeting: id))).revisioned()
    }

    /// Newest first. A meeting that fails to decode is skipped and logged rather than
    /// taking the whole library down with it.
    func list() -> [Meeting] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: meetingsDirectory, includingPropertiesForKeys: nil)) ?? []

        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { url in
                do {
                    return try JSONDecoder.excerpt.decode(Meeting.self, from: Data(contentsOf: url)).revisioned()
                } catch {
                    log.error("skipping unreadable meeting \(url.lastPathComponent): \(error)")
                    return nil
                }
            }
            .sorted { $0.startedAt > $1.startedAt }
    }

    func delete(id: String) throws {
        closeJournal(id: id)
        // The meeting file is removed last. If cleanup fails, the library entry is
        // still present and the caller can truthfully report that deletion failed.
        try removeIfPresent(url(forJournal: id))
        try removeIfPresent(imageJournal(id))
        try removeIfPresent(draftJournal(id))
        try removeIfPresent(url(forMeeting: id))
    }

    func apply(_ mutation: MeetingMutation) throws -> MeetingMutationAcknowledgment {
        let meetingURL = url(forMeeting: mutation.meetingId)
        if !FileManager.default.fileExists(atPath: meetingURL.path(percentEncoded: false)) {
            guard mutation.changes.count == 1,
                  case .create = mutation.changes[0] else {
                throw MeetingMutationFailure.missingMeeting(mutation.meetingId)
            }
            let acknowledgment = try MeetingMutationReducer.created(mutation)
            try save(acknowledgment.meeting)
            return acknowledgment
        }
        let current = try load(id: mutation.meetingId)
        let acknowledgment = try MeetingMutationReducer.acknowledgment(for: mutation, applyingTo: current)
        if acknowledgment.status == .applied || acknowledgment.status == .rebased {
            try save(acknowledgment.meeting)
        }
        return acknowledgment
    }

    /// Native background work uses the same load-modify-atomic-save boundary as an
    /// editor mutation and therefore cannot recreate a meeting after deletion.
    func update(id: String, _ change: (inout Meeting) throws -> Void) throws -> Meeting {
        var meeting = try load(id: id)
        let previousRevision = meeting.revision ?? 0
        try change(&meeting)
        meeting.schemaVersion = Meeting.currentSchemaVersion
        meeting.revision = previousRevision + 1
        try save(meeting)
        return meeting
    }

    // MARK: - Journal

    /// Appends one settled event and flushes it. Called a few times a minute, so the
    /// simple synchronous write is the right one — moving it off the main actor would
    /// buy nothing and cost the ordering guarantee that makes the file replayable.
    @discardableResult
    func append(_ event: TranscriptEvent, toJournalFor id: String) -> Bool {
        do {
            var line = try JSONEncoder.excerpt.encode(event)
            line.append(0x0A)                                 // newline-delimited JSON
            try faults.beforeJournalAppend?(url(forJournal: id))
            try handle(for: id).write(contentsOf: line)
            return true
        } catch {
            // A journal failure must never stop a meeting. The in-memory transcript is
            // still whole; what is lost is only the ability to recover from a crash,
            // and saying so once is more useful than failing the capture.
            log.error("journal append failed for \(id): \(error)")
            return false
        }
    }

    /// Meetings whose journal exists but whose meeting file does not — an interrupted
    /// meeting that was never finished.
    func recoverable() -> [String] {
        let journals = (try? FileManager.default.contentsOfDirectory(
            at: journalDirectory, includingPropertiesForKeys: nil)) ?? []

        return Array(Set(journals
            .filter { $0.pathExtension == "ndjson" || $0.lastPathComponent.hasSuffix(".images.json") || $0.lastPathComponent.hasSuffix(".draft.json") }
            .map { $0.lastPathComponent
                .replacingOccurrences(of: ".images.json", with: "")
                .replacingOccurrences(of: ".draft.json", with: "")
                .replacingOccurrences(of: ".ndjson", with: "") }
            .filter { !FileManager.default.fileExists(atPath: url(forMeeting: $0).path(percentEncoded: false)) }
            )).sorted()
    }

    /// Replays a journal. A truncated final line — the shape a crash leaves — is
    /// dropped rather than failing the whole recovery.
    func replayJournal(id: String) -> [TranscriptEvent] {
        guard let text = try? String(contentsOf: url(forJournal: id), encoding: .utf8) else { return [] }
        return text
            .split(separator: "\n", omittingEmptySubsequences: true)
            .compactMap { line in
                guard let data = line.data(using: .utf8) else { return nil }
                return try? JSONDecoder.excerpt.decode(TranscriptEvent.self, from: data)
            }
    }

    func closeJournal(id: String) {
        try? handles[id]?.close()
        handles[id] = nil
    }

    /// Removes the journal once its meeting is safely saved.
    func discardJournal(id: String) {
        closeJournal(id: id)
        try? FileManager.default.removeItem(at: url(forJournal: id))
        try? FileManager.default.removeItem(at: imageJournal(id))
        try? FileManager.default.removeItem(at: draftJournal(id))
    }

    func checkpointImages(_ images: [MeetingImage], id: String) throws {
        let destination = imageJournal(id)
        try faults.beforeWrite?(destination)
        try JSONEncoder.excerpt.encode(images).write(to: destination, options: .atomic)
    }

    func recoverImages(id: String) -> [MeetingImage] {
        guard let data = try? Data(contentsOf: imageJournal(id)) else { return [] }
        return (try? JSONDecoder.excerpt.decode([MeetingImage].self, from: data)) ?? []
    }

    /// A compact atomic checkpoint complements the append-only speech journal. It
    /// preserves writing even when no recognizer result has settled yet.
    func checkpointDraft(_ meeting: Meeting) throws {
        let destination = draftJournal(meeting.id)
        try faults.beforeWrite?(destination)
        try JSONEncoder.excerpt.encode(meeting.revisioned()).write(to: destination, options: .atomic)
    }

    func recoverDraft(id: String) -> Meeting? {
        guard let data = try? Data(contentsOf: draftJournal(id)) else { return nil }
        return try? JSONDecoder.excerpt.decode(Meeting.self, from: data)
    }

    private func imageJournal(_ id: String) -> URL { journalDirectory.appending(path: "\(id).images.json") }
    private func draftJournal(_ id: String) -> URL { journalDirectory.appending(path: "\(id).draft.json") }

    // MARK: - Paths

    private func url(forMeeting id: String) -> URL {
        meetingsDirectory.appending(path: "\(id).json")
    }

    private func url(forJournal id: String) -> URL {
        journalDirectory.appending(path: "\(id).ndjson")
    }

    private func removeIfPresent(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return }
        try faults.beforeRemove?(url)
        try FileManager.default.removeItem(at: url)
    }

    private func handle(for id: String) throws -> FileHandle {
        if let existing = handles[id] { return existing }
        let url = url(forJournal: id)
        if !FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
            FileManager.default.createFile(atPath: url.path(percentEncoded: false), contents: nil)
        }
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        handles[id] = handle
        return handle
    }

    /// Where the user's meetings actually are, for the "your notes are on this Mac"
    /// claim to be something they can go and look at.
    var folder: URL { root }
}
