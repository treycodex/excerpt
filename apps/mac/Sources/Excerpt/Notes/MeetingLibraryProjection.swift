import Foundation

/// What a library row needs, without the transcript or image bytes. The stored
/// meeting remains the source of truth; opening one still loads the full record.
struct MeetingLibraryEntry: Codable, Sendable, Equatable {
    var id: String
    var title: String
    var startedAt: String
    var endedAt: String?
    var processing: ProcessingMode
    var draftRevision: Int?
    var noteCount: Int
    var decidedCount: Int
    var mineCount: Int

    init(_ meeting: Meeting) {
        id = meeting.id
        title = meeting.title
        startedAt = meeting.startedAt
        endedAt = meeting.endedAt
        processing = meeting.processing
        draftRevision = meeting.draftRevision
        let live = meeting.items.filter { $0.dismissed != true }
        decidedCount = live.filter { $0.category == .decision && $0.state == .decided }.count
        mineCount = live.filter { $0.assignee == .you }.count
        let written: Int
        if let blocks = meeting.notes?.blocks, !blocks.isEmpty {
            written = blocks.filter { $0.kind != "image" && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
        } else {
            written = MeetingLibrarySearch.noteTexts(meeting).filter {
                !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }.count
        }
        noteCount = written
    }
}

struct MeetingSearchHit: Codable, Sendable, Equatable {
    var meeting: MeetingLibraryEntry
    var kind: String
    var snippet: String
    /// UTF-16 offsets, matching JavaScript's slice().
    var offset: Int
    var length: Int
    var eventId: String? = nil
}

/// Persisted separately from the meeting. Only searchable wording crosses this
/// boundary; an index can always be rebuilt from the authoritative meeting file.
struct MeetingLibraryRecord: Codable, Sendable, Equatable {
    struct EventText: Codable, Sendable, Equatable {
        var id: String
        var text: String
    }

    var entry: MeetingLibraryEntry
    var notes: [String]
    var captions: [String]
    var events: [EventText]

    init(_ meeting: Meeting) {
        entry = MeetingLibraryEntry(meeting)
        notes = MeetingLibrarySearch.noteTexts(meeting)
        captions = (meeting.images ?? []).map(\.caption)
        events = meeting.events.filter(\.isFinal).map { EventText(id: $0.id, text: $0.text) }
    }
}

enum MeetingLibrarySearch {
    private static let context = 42

    static func noteTexts(_ meeting: Meeting) -> [String] {
        guard let notes = meeting.notes else { return [] }
        if let blocks = notes.blocks, !blocks.isEmpty {
            return blocks.filter { $0.kind != "image" }.map(\.text)
        }
        return notes.keyPoints.map(\.text) + notes.topics.flatMap { $0.bullets.map(\.text) }
    }

    /// Search only saved wording and captions. The result crosses the bridge, but
    /// no matching operation transfers screenshots or the whole transcript.
    static func search(_ meetings: [Meeting], query: String) -> [MeetingSearchHit] {
        searchRecords(meetings.map(MeetingLibraryRecord.init), query: query)
    }

    static func searchRecords(_ records: [MeetingLibraryRecord], query: String) -> [MeetingSearchHit] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return [] }
        return records.compactMap { bestMatch($0, needle: needle) }
    }

    private static func bestMatch(_ record: MeetingLibraryRecord, needle: String) -> MeetingSearchHit? {
        func found(_ text: String, kind: String, eventId: String? = nil) -> MeetingSearchHit? {
            guard let match = snippet(text, needle: needle) else { return nil }
            return MeetingSearchHit(meeting: record.entry, kind: kind, snippet: match.text,
                offset: match.offset, length: match.length, eventId: eventId)
        }
        if let hit = found(record.entry.title, kind: "title") { return hit }
        for text in record.notes {
            if let hit = found(text, kind: "note") { return hit }
        }
        for caption in record.captions {
            if let hit = found(caption, kind: "moment") { return hit }
        }
        for event in record.events {
            if let hit = found(event.text, kind: "transcript", eventId: event.id) { return hit }
        }
        return nil
    }

    private static func snippet(_ text: String, needle: String) -> (text: String, offset: Int, length: Int)? {
        guard let range = text.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) else { return nil }
        let utf16 = NSRange(range, in: text)
        let whole = text as NSString
        let start = max(0, utf16.location - context)
        let end = min(whole.length, NSMaxRange(utf16) + context)
        let lead = start > 0 ? "…" : ""
        let tail = end < whole.length ? "…" : ""
        return (lead + whole.substring(with: NSRange(location: start, length: end - start)) + tail,
            utf16.location - start + lead.utf16.count, utf16.length)
    }
}
