import CoreMedia
import Foundation
import Testing
@testable import Excerpt

/// The journal is the mechanism behind the one gate that was never negotiable: an
/// interruption may stop capture, but it must not silently lose what was already
/// transcribed. These run against a real directory in a temporary folder, because
/// what is being tested is what survives on disk.
@MainActor
struct MeetingStoreTests {

    private func makeStore() throws -> (MeetingStore, URL) {
        let root = URL(filePath: NSTemporaryDirectory())
            .appending(path: "excerpt-tests-\(UUID().uuidString)")
        return (try MeetingStore(root: root), root)
    }

    private func event(_ index: Int, text: String) -> TranscriptEvent {
        TranscriptEvent(
            id: "e\(index)", sessionId: "m-1", role: index.isMultiple(of: 2) ? .remote : .you,
            speakerLabel: index.isMultiple(of: 2) ? "SPEAKER" : "YOU",
            text: text, isFinal: true, tArrived: Double(index) * 1000,
            tStart: Double(index), tEnd: Double(index) + 2
        )
    }

    private func meeting(id: String = "m-1", items: [Item] = []) -> Meeting {
        Meeting(id: id, title: "Meeting · test", startedAt: "2026-09-10T15:20:00Z",
                endedAt: nil, processing: .onDevice,
                events: [event(0, text: "Let's move the launch to October.")], items: items)
    }

    @Test func `queued notes are found from the library index after a restart`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        var queued = meeting(id: "queued")
        queued.generationStatus = NotesGenerationStatus(state: .queued, generationId: "g", sourceRevision: 0)
        try store.save(queued)
        try store.save(meeting(id: "idle"))

        #expect(try MeetingStore(root: root).pendingGenerationIds() == ["queued"])
        // An index written before it recorded generation state is rebuilt, not trusted.
        try FileManager.default.removeItem(at: root.appending(path: "library-index"))
        #expect(try MeetingStore(root: root).pendingGenerationIds() == ["queued"])

        queued.generationStatus?.state = .ready
        try store.save(queued)
        #expect(try MeetingStore(root: root).pendingGenerationIds().isEmpty)
    }

    @Test func `a saved meeting comes back the way it went in`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let original = meeting()
        try store.save(original)
        #expect(try store.load(id: original.id) == original.revisioned())
        #expect(store.list().map(\.id) == [original.id])

        try store.delete(id: original.id)
        #expect(store.list().isEmpty)
    }

    @Test func `deleted note blocks survive native storage and legacy documents decode`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        var original = meeting()
        let removed = NoteBlock(id: "removed", kind: "bullet", text: "A removed excerpt", evidence: [])
        original.notes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [], deletedBlocks: [removed])
        try store.save(original)
        #expect(try store.load(id: original.id).notes?.deletedBlocks == [removed])
        let legacy = Data(#"{"version":1,"method":"extractive","keyPoints":[],"topics":[],"blocks":[]}"#.utf8)
        #expect(try JSONDecoder().decode(NotesDocument.self, from: legacy).deletedBlocks == nil)
    }

    @Test func `the library survives one unreadable file`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        try store.save(meeting(id: "m-good"))
        try "{ not json".write(
            to: root.appending(path: "meetings/m-broken.json"), atomically: true, encoding: .utf8)

        // One corrupt file must not take the whole library down with it.
        #expect(store.list().map(\.id) == ["m-good"])
    }

    @Test func `summary edits and completed actions survive the native store`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let evidence = Evidence(eventIds: ["e0"], tArrived: 0, quote: "I'll send the deck.", speakerLabel: "YOU")
        var original = meeting(items: [Item(id: "action", category: .action, state: .decided,
            title: "Send the deck", evidence: [evidence], assignee: .you, salience: 1, completed: true)])
        original.notes = NotesDocument(method: "on-device", keyPoints: [NoteBullet(id: "p", text: "My edited note", evidence: [evidence], userEdited: true)], topics: [])
        try store.save(original)
        #expect(try store.load(id: original.id) == original.revisioned())
    }

    @Test func `screenshots recover even before the first transcript event`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let image = MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30000, caption: "Launch plan")
        try store.checkpointImages([image], id: "m-1")
        #expect(store.recoverable() == ["m-1"])
        #expect(try store.recoverImages(id: "m-1") == [image])
        var original = meeting()
        original.images = [image]
        original.events[0].originalText = "Original speech"
        original.events[0].corrections = [TranscriptCorrection(text: original.events[0].text, correctedAt: "2026-09-10T16:00:00Z")]
        original.notes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "image-shot", kind: "image", text: "My caption", evidence: [], at: 30000, imageId: "shot", userEdited: true)
        ])
        try store.save(original)
        store.discardJournal(id: "m-1")
        #expect(store.recoverable().isEmpty)
        #expect(try store.recoverImages(id: "m-1").isEmpty)
        #expect(try store.load(id: "m-1") == original.revisioned())
    }

    @Test func `legacy inline images migrate only on save and reopen byte for byte`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let image = MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Launch plan")
        var legacy = meeting()
        legacy.images = [image]
        let file = root.appending(path: "meetings/m-1.json")
        try JSONEncoder.excerpt.encode(legacy).write(to: file, options: .atomic)
        #expect(try String(contentsOf: file, encoding: .utf8).contains(image.dataUrl))
        #expect(try store.load(id: legacy.id).images == [image])

        legacy.title = "Renamed without rewriting image bytes"
        try store.save(legacy)
        let compact = try String(contentsOf: file, encoding: .utf8)
        #expect(!compact.contains(image.dataUrl))
        #expect(compact.contains("excerpt-asset:v1:"))
        let reopened = try MeetingStore(root: root)
        #expect(try reopened.load(id: legacy.id) == legacy.revisioned())
        try reopened.checkpointDraft(legacy)
        #expect(try MeetingStore(root: root).recoverDraft(id: legacy.id) == legacy.revisioned())
        try reopened.delete(id: legacy.id)
        #expect(!FileManager.default.fileExists(atPath: root.appending(path: "meeting-assets/m-1").path()))
    }

    @Test func `failed metadata write leaves legacy inline image readable`() throws {
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-asset-fault-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try MeetingStore(root: root)
        var legacy = meeting()
        legacy.images = [MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Original")]
        let file = root.appending(path: "meetings/m-1.json")
        try JSONEncoder.excerpt.encode(legacy).write(to: file, options: .atomic)
        var faults = MeetingStore.Faults()
        faults.beforeWrite = { _ in throw CocoaError(.fileWriteNoPermission) }
        let failing = try MeetingStore(root: root, faults: faults)
        legacy.title = "Unsaved title"
        #expect(throws: CocoaError.self) { try failing.save(legacy) }
        #expect(try first.load(id: legacy.id).title == "Meeting · test")
        #expect(try first.load(id: legacy.id).images == legacy.images)
        #expect(try String(contentsOf: file, encoding: .utf8).contains(legacy.images![0].dataUrl))
    }

    @Test func `a missing extracted image fails a cold meeting read instead of disappearing`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        var original = meeting()
        original.images = [MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Original")]
        try store.save(original)
        let directory = root.appending(path: "meeting-assets/m-1")
        let asset = try #require(FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil).first)
        try FileManager.default.removeItem(at: asset)
        let reopened = try MeetingStore(root: root)
        #expect(throws: Error.self) { try reopened.load(id: original.id) }
    }

    @Test func `unreadable recovery assets keep the journal available for retry`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let image = MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Original")
        try store.checkpointImages([image], id: "m-1")
        var draft = meeting()
        draft.images = [image]
        try store.checkpointDraft(draft)
        let asset = try #require(FileManager.default.contentsOfDirectory(
            at: root.appending(path: "meeting-assets/m-1"), includingPropertiesForKeys: nil).first)
        try FileManager.default.removeItem(at: asset)
        let reopened = try MeetingStore(root: root)
        #expect(throws: Error.self) { try reopened.recoverImages(id: "m-1") }
        #expect(throws: Error.self) { try reopened.recoverDraft(id: "m-1") }
        #expect(reopened.recoverable() == ["m-1"])
    }

    @Test func `full image cache stays bounded across meetings`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        for index in 0..<5 {
            var saved = meeting(id: "meeting-\(index)")
            saved.images = [MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
                capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Screen")]
            try store.save(saved)
            #expect(store.cachedFullMeetingCount <= 2)
        }
        #expect(try store.load(id: "meeting-0").images?.first?.dataUrl == "data:image/png;base64,aGVsbG8=")
        #expect(store.cachedFullMeetingCount <= 2)
        #expect(store.cachedLibraryRecordCount <= 128)
    }

    @Test func `writing makes a live draft recoverable before speech`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }
        var draft = meeting(id: "m-writing")
        draft.events = []
        draft.draftRevision = 3
        draft.notes = NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: [
            NoteBlock(id: "mine", kind: "paragraph", text: "Compare the two navigation ideas",
                      evidence: [], userEdited: true)
        ])

        try store.checkpointDraft(draft)

        #expect(store.recoverable() == ["m-writing"])
        #expect(try store.recoverDraft(id: "m-writing") == draft.revisioned())
        store.discardJournal(id: "m-writing")
        #expect(store.recoverable().isEmpty)
    }

    @Test func `journalled events replay in the order they settled`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let written = (0..<5).map { event($0, text: "line \($0)") }
        for item in written { store.append(item, toJournalFor: "m-1") }
        store.closeJournal(id: "m-1")

        let replayed = store.replayJournal(id: "m-1")
        #expect(replayed == written)
        // Audio alignment has to survive the round trip, or recovered evidence would
        // scrub to the wrong words.
        #expect(replayed.first?.tStart == 0)
    }

    @Test func `a half-written last line is dropped, not fatal`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        store.append(event(0, text: "complete"), toJournalFor: "m-1")
        store.closeJournal(id: "m-1")

        // The shape a crash leaves: a line that was being written when power went.
        let journal = root.appending(path: "journal/m-1.ndjson")
        let handle = try FileHandle(forWritingTo: journal)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(#"{"id":"e1","text":"trunc"#.utf8))
        try handle.close()

        let replayed = store.replayJournal(id: "m-1")
        #expect(replayed.count == 1)
        #expect(replayed.first?.text == "complete")
    }

    @Test func `a journal with no meeting beside it is recoverable`() throws {
        let (store, root) = try makeStore()
        defer { try? FileManager.default.removeItem(at: root) }

        store.append(event(0, text: "interrupted"), toJournalFor: "m-lost")
        store.closeJournal(id: "m-lost")
        #expect(store.recoverable() == ["m-lost"])

        // Once the meeting is saved there is nothing left to recover.
        try store.save(meeting(id: "m-lost"))
        #expect(store.recoverable().isEmpty)

        store.discardJournal(id: "m-lost")
        #expect(store.replayJournal(id: "m-lost").isEmpty)
    }
}

/// Gate 8 in miniature: two analyzers counting from their own first frame, related
/// by the capture clock.
struct MeetingClockTests {

    private func time(_ seconds: Double) -> CMTime {
        CMTime(seconds: seconds, preferredTimescale: 1000)
    }

    @Test func `the first source to arrive defines zero`() {
        var clock = MeetingClock()
        clock.adopt(firstBufferAt: time(100))
        clock.adopt(firstBufferAt: time(140))     // the other source, later — ignored
        #expect(clock.origin == time(100))
        #expect(clock.offsetSeconds(forSourceStartingAt: time(100)) == 0)
    }

    @Test func `a source that started later is offset by exactly that much`() {
        var clock = MeetingClock()
        clock.adopt(firstBufferAt: time(100))

        // 1.4s into the microphone's own audio is 3.9s into the meeting, because the
        // microphone did not start producing until 2.5s in.
        let range = clock.meetingRange(localStart: 1.4, localEnd: 3.0, sourceStartingAt: time(102.5))
        #expect(abs(range.start - 3.9) < 0.001)
        #expect(abs(range.end - 5.5) < 0.001)
    }

    @Test func `a source cannot start before the meeting did`() {
        var clock = MeetingClock()
        clock.adopt(firstBufferAt: time(100))
        // Impossible, and a negative offset would put evidence before the recording.
        #expect(clock.offsetSeconds(forSourceStartingAt: time(90)) == 0)
    }

    @Test func `with no audio yet there is no offset to apply`() {
        let clock = MeetingClock()
        #expect(clock.origin == nil)
        #expect(clock.offsetSeconds(forSourceStartingAt: time(100)) == 0)
    }
}

@MainActor
struct MeetingMomentsTests {
    private func event(_ id: String, at: Double, final: Bool = true) -> TranscriptEvent {
        TranscriptEvent(id: id, sessionId: "m", role: .remote, speakerLabel: "SPEAKER",
                        text: id, isFinal: final, tArrived: at, tStart: at / 1000, tEnd: at / 1000)
    }

    @Test func `a capture anchors final speech twenty seconds before through fifteen after`() {
        let context = MeetingMoments.context(at: 30_000, events: [
            event("too-early", at: 9_000), event("before", at: 10_000),
            event("live", at: 30_000, final: false), event("after", at: 45_000),
            event("too-late", at: 46_000),
        ])
        #expect(context.startAt == 10_000)
        #expect(context.endAt == 45_000)
        #expect(context.eventIds == ["before", "after"])
    }

    @Test func `future settled speech joins context without changing capture metadata`() {
        let image = MeetingImage(id: "shot", dataUrl: "data:image/png;base64,aGVsbG8=",
            capturedAt: "2026-09-10T15:20:30Z", at: 30_000, caption: "Navigation",
            origin: "excerpt", context: MeetingMoments.context(at: 30_000, events: [event("before", at: 20_000)]))
        let next = MeetingMoments.reconcile([image], events: [event("before", at: 20_000), event("after", at: 40_000)])
        #expect(next[0].at == image.at)
        #expect(next[0].capturedAt == image.capturedAt)
        #expect(next[0].origin == "excerpt")
        #expect(next[0].context?.eventIds == ["before", "after"])
    }
}
