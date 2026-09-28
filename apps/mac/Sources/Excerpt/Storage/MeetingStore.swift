import Foundation
import OSLog
import Darwin
import CryptoKit

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
        case assetUnavailable(String)

        var errorDescription: String? {
            switch self {
            case .directoryUnavailable(let path):
                "Excerpt could not use its folder at \(path)."
            case .assetUnavailable(let id):
                "A saved image for \(id) could not be verified. The meeting was not changed."
            }
        }
    }

    private let root: URL
    private let meetingsDirectory: URL
    private let journalDirectory: URL
    private let libraryIndexDirectory: URL
    private let assetsDirectory: URL
    private let log = Logger(subsystem: "com.excerpt.app", category: "store")
    private let faults: Faults

    /// Open journals, kept so an append does not reopen the file per line.
    private var handles: [String: FileHandle] = [:]
    private var libraryCache: [String: LibraryIndex] = [:]
    private var recentLibraryIds: [String] = []
    private let libraryCacheLimit = 128
    private var meetingCache: [String: (stamp: FileStamp, meeting: Meeting)] = [:]
    private var assetCache: [String: [String: (dataUrl: String, reference: String)]] = [:]
    private var recentMeetingIds: [String] = []
    private let fullMeetingCacheLimit = 2
    private let assetPrefix = "excerpt-asset:v1:"
    var cachedFullMeetingCount: Int { meetingCache.count }
    var cachedLibraryRecordCount: Int { libraryCache.count }

    private struct FileStamp: Codable, Equatable {
        var size: Int64
        var seconds: Int64
        var nanoseconds: Int64
        var inode: UInt64

        init?(_ url: URL) {
            var info = stat()
            guard Darwin.lstat(url.path(percentEncoded: false), &info) == 0 else { return nil }
            size = info.st_size
            seconds = Int64(info.st_mtimespec.tv_sec)
            nanoseconds = Int64(info.st_mtimespec.tv_nsec)
            inode = info.st_ino
        }
    }

    private struct LibraryIndex: Codable {
        // Version 2 counts written text, excluding transcript captures and hidden review items.
        var version: Int = 2
        var stamp: FileStamp
        var record: MeetingLibraryRecord
    }

    init(root: URL? = nil, faults: Faults = Faults()) throws {
        let base = try root ?? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "Excerpt")

        self.root = base
        self.faults = faults
        meetingsDirectory = base.appending(path: "meetings")
        journalDirectory = base.appending(path: "journal")
        libraryIndexDirectory = base.appending(path: "library-index")
        assetsDirectory = base.appending(path: "meeting-assets")

        for directory in [base, meetingsDirectory, journalDirectory, libraryIndexDirectory, assetsDirectory] {
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
        let data = try JSONEncoder.excerpt.encode(compactAssets(in: durable))
        // Atomic: a meeting half-written by a crash is worse than one not written,
        // because it looks complete in the library.
        let destination = url(forMeeting: durable.id)
        try faults.beforeWrite?(destination)
        try data.write(to: destination, options: .atomic)
        // An index is disposable. A crash between these writes leaves a mismatched
        // stamp, so the next reader rebuilds it from the saved meeting.
        if let stamp = FileStamp(destination) {
            touchFullMeetingCache(durable.id)
            meetingCache[durable.id] = (stamp, durable)
            let index = LibraryIndex(stamp: stamp, record: MeetingLibraryRecord(durable))
            touchLibraryCache(durable.id)
            libraryCache[durable.id] = index
            writeLibraryIndex(index, id: durable.id)
        } else {
            meetingCache[durable.id] = nil
            libraryCache[durable.id] = nil
        }
    }

    func load(id: String) throws -> Meeting {
        let url = url(forMeeting: id)
        if let stamp = FileStamp(url), let cached = meetingCache[id], cached.stamp == stamp {
            touchFullMeetingCache(id)
            return cached.meeting
        }
        let loaded = try hydrateAssets(in: JSONDecoder.excerpt.decode(Meeting.self,
            from: Data(contentsOf: url))).revisioned()
        if let stamp = FileStamp(url) {
            touchFullMeetingCache(id)
            meetingCache[id] = (stamp, loaded)
        }
        return loaded
    }

    func contains(id: String) -> Bool {
        FileManager.default.fileExists(atPath: url(forMeeting: id).path(percentEncoded: false))
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
                    return try load(id: url.deletingPathExtension().lastPathComponent)
                } catch {
                    log.error("skipping unreadable meeting \(url.lastPathComponent): \(error)")
                    return nil
                }
            }
            .sorted { $0.startedAt > $1.startedAt }
    }

    /// Reads compact sidecars on warm requests, validating each against the
    /// authoritative file. Legacy files or stale/corrupt indexes decode once.
    func libraryRecords() -> [MeetingLibraryRecord] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: meetingsDirectory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }.compactMap { url in
            guard let stamp = FileStamp(url) else { return nil }
            let id = url.deletingPathExtension().lastPathComponent
            if let cached = libraryCache[id], cached.stamp == stamp {
                touchLibraryCache(id)
                return cached.record
            }
            if let data = try? Data(contentsOf: libraryIndexURL(id)),
               let index = try? JSONDecoder.excerpt.decode(LibraryIndex.self, from: data),
               index.version == 2, index.stamp == stamp, index.record.entry.id == id {
                touchLibraryCache(id)
                libraryCache[id] = index
                return index.record
            }
            do {
                let meeting = try load(id: id)
                let index = LibraryIndex(stamp: stamp, record: MeetingLibraryRecord(meeting))
                touchLibraryCache(id)
                libraryCache[id] = index
                writeLibraryIndex(index, id: id)
                return index.record
            } catch {
                libraryCache[id] = nil
                log.error("skipping unreadable meeting \(url.lastPathComponent): \(error)")
                return nil
            }
        }.sorted { $0.entry.startedAt > $1.entry.startedAt }
    }

    func delete(id: String) throws {
        closeJournal(id: id)
        // The meeting file is removed last. If cleanup fails, the library entry is
        // still present and the caller can truthfully report that deletion failed.
        try removeIfPresent(url(forJournal: id))
        try removeIfPresent(imageJournal(id))
        try removeIfPresent(draftJournal(id))
        try removeIfPresent(url(forMeeting: id))
        meetingCache[id] = nil
        assetCache[id] = nil
        recentMeetingIds.removeAll { $0 == id }
        libraryCache[id] = nil
        recentLibraryIds.removeAll { $0 == id }
        try? FileManager.default.removeItem(at: libraryIndexURL(id))
        try? FileManager.default.removeItem(at: assetDirectory(id))
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
        try JSONEncoder.excerpt.encode(compactImages(images, meetingId: id))
            .write(to: destination, options: .atomic)
    }

    func recoverImages(id: String) throws -> [MeetingImage] {
        guard FileManager.default.fileExists(atPath: imageJournal(id).path(percentEncoded: false)) else { return [] }
        return try hydrateImages(JSONDecoder.excerpt.decode([MeetingImage].self,
            from: Data(contentsOf: imageJournal(id))), meetingId: id)
    }

    /// A compact atomic checkpoint complements the append-only speech journal. It
    /// preserves writing even when no recognizer result has settled yet.
    func checkpointDraft(_ meeting: Meeting) throws {
        let destination = draftJournal(meeting.id)
        try faults.beforeWrite?(destination)
        try JSONEncoder.excerpt.encode(compactAssets(in: meeting.revisioned()))
            .write(to: destination, options: .atomic)
    }

    func recoverDraft(id: String) throws -> Meeting? {
        guard FileManager.default.fileExists(atPath: draftJournal(id).path(percentEncoded: false)) else { return nil }
        return try hydrateAssets(in: JSONDecoder.excerpt.decode(Meeting.self,
            from: Data(contentsOf: draftJournal(id))))
    }

    private func imageJournal(_ id: String) -> URL { journalDirectory.appending(path: "\(id).images.json") }
    private func draftJournal(_ id: String) -> URL { journalDirectory.appending(path: "\(id).draft.json") }

    // MARK: - Paths

    private func url(forMeeting id: String) -> URL {
        meetingsDirectory.appending(path: "\(id).json")
    }

    private func libraryIndexURL(_ id: String) -> URL {
        libraryIndexDirectory.appending(path: "\(id).json")
    }

    private func assetDirectory(_ id: String) -> URL {
        assetsDirectory.appending(path: id)
    }

    private func assetURL(meetingId: String, digest: String) -> URL {
        assetDirectory(meetingId).appending(path: "\(digest).txt")
    }

    private func touchFullMeetingCache(_ id: String) {
        recentMeetingIds.removeAll { $0 == id }
        recentMeetingIds.append(id)
        while recentMeetingIds.count > fullMeetingCacheLimit {
            let evicted = recentMeetingIds.removeFirst()
            meetingCache[evicted] = nil
            assetCache[evicted] = nil
        }
    }

    private func touchLibraryCache(_ id: String) {
        recentLibraryIds.removeAll { $0 == id }
        recentLibraryIds.append(id)
        while recentLibraryIds.count > libraryCacheLimit {
            libraryCache[recentLibraryIds.removeFirst()] = nil
        }
    }

    private func checkedDigest(_ reference: String, meetingId: String) throws -> String {
        let digest = String(reference.dropFirst(assetPrefix.count))
        guard digest.utf8.count == 64,
              digest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw Failure.assetUnavailable(meetingId)
        }
        return digest
    }

    /// Assets are written and checked before a compact meeting/draft can refer to
    /// them. A crash before the atomic metadata write leaves only an orphan asset;
    /// the old inline meeting or previous metadata remains readable.
    private func compactAssets(in meeting: Meeting) throws -> Meeting {
        guard let images = meeting.images else { return meeting }
        var compact = meeting
        compact.images = try compactImages(images, meetingId: meeting.id)
        return compact
    }

    private func compactImages(_ images: [MeetingImage], meetingId: String) throws -> [MeetingImage] {
        touchFullMeetingCache(meetingId)
        return try images.map { image in
            var compact = image
            if image.dataUrl.hasPrefix(assetPrefix) {
                let digest = try checkedDigest(image.dataUrl, meetingId: meetingId)
                guard FileManager.default.fileExists(atPath: assetURL(meetingId: meetingId, digest: digest).path(percentEncoded: false)) else {
                    throw Failure.assetUnavailable(meetingId)
                }
                return compact
            }
            let cached = assetCache[meetingId]?[image.id]
            let digest: String
            if let cached, cached.dataUrl == image.dataUrl {
                digest = String(cached.reference.dropFirst(assetPrefix.count))
            } else {
                digest = SHA256.hash(data: Data(image.dataUrl.utf8))
                    .map { String(format: "%02x", $0) }.joined()
            }
            let destination = assetURL(meetingId: meetingId, digest: digest)
            if !FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.createDirectory(at: assetDirectory(meetingId), withIntermediateDirectories: true)
                try Data(image.dataUrl.utf8).write(to: destination, options: .atomic)
                let written = try Data(contentsOf: destination)
                guard SHA256.hash(data: written).map({ String(format: "%02x", $0) }).joined() == digest else {
                    throw Failure.assetUnavailable(meetingId)
                }
            }
            let reference = assetPrefix + digest
            assetCache[meetingId, default: [:]][image.id] = (image.dataUrl, reference)
            compact.dataUrl = reference
            return compact
        }
    }

    private func hydrateAssets(in meeting: Meeting) throws -> Meeting {
        guard let images = meeting.images else { return meeting }
        var hydrated = meeting
        hydrated.images = try hydrateImages(images, meetingId: meeting.id)
        return hydrated
    }

    private func hydrateImages(_ images: [MeetingImage], meetingId: String) throws -> [MeetingImage] {
        touchFullMeetingCache(meetingId)
        return try images.map { image in
            guard image.dataUrl.hasPrefix(assetPrefix) else { return image }
            let digest = try checkedDigest(image.dataUrl, meetingId: meetingId)
            guard let data = try? Data(contentsOf: assetURL(meetingId: meetingId, digest: digest)) else {
                throw Failure.assetUnavailable(meetingId)
            }
            guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == digest,
                  let dataUrl = String(data: data, encoding: .utf8) else {
                throw Failure.assetUnavailable(meetingId)
            }
            var hydrated = image
            hydrated.dataUrl = dataUrl
            assetCache[meetingId, default: [:]][image.id] = (dataUrl, image.dataUrl)
            return hydrated
        }
    }

    private func writeLibraryIndex(_ index: LibraryIndex, id: String) {
        do {
            try JSONEncoder.excerpt.encode(index).write(to: libraryIndexURL(id), options: .atomic)
        } catch {
            log.warning("library index unavailable for \(id): \(error)")
        }
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
