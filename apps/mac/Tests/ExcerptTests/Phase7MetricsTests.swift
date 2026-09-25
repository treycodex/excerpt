import AppKit
import Darwin
import Foundation
import Testing
@testable import Excerpt

/// Opt-in measurement, not a timing assertion. Every byte stays in an isolated
/// temporary MeetingStore; this never reads the user's Excerpt directory.
@MainActor
struct Phase7MetricsTests {
    private func residentBytes() -> UInt64? {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size /
            MemoryLayout<integer_t>.size)
        let status = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        return status == KERN_SUCCESS ? UInt64(info.resident_size) : nil
    }

    private func screenshot(seed: Int = 0) throws -> Data {
        let width = 2560, height = 1440
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width,
            pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
            isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0,
            bitsPerPixel: 0), let bytes = bitmap.bitmapData else {
            throw CocoaError(.fileReadCorruptFile)
        }
        // Small noisy tiles mimic a legible screen's mix of flat areas and detail.
        // The real PNG encoder decides the size; no invented "image byte" estimate.
        for y in 0..<height {
            for x in 0..<width {
                let tile = UInt32(truncatingIfNeeded: (x / 4) &* 73_856_093)
                    ^ UInt32(truncatingIfNeeded: (y / 4) &* 19_349_663)
                    ^ UInt32(truncatingIfNeeded: seed &* 2_654_435_761)
                let offset = y * bitmap.bytesPerRow + x * 4
                bytes[offset] = UInt8(truncatingIfNeeded: tile)
                bytes[offset + 1] = UInt8(truncatingIfNeeded: tile >> 8)
                bytes[offset + 2] = UInt8(truncatingIfNeeded: tile >> 16)
                bytes[offset + 3] = 255
            }
        }
        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return png
    }

    private func meeting(id: String, minutes: Int, images: [MeetingImage] = []) -> Meeting {
        let events = (0..<(minutes * 6)).map { index in
            TranscriptEvent(id: "\(id)-e\(index)", sessionId: id, role: .remote,
                speakerLabel: "SPEAKER", text: "The synthetic project update \(index) covers the launch timeline and follow-up work.",
                isFinal: true, tArrived: Double(index) * 10_000,
                tStart: Double(index) * 10, tEnd: Double(index) * 10 + 4)
        }
        let blocks = events.enumerated().compactMap { index, event -> NoteBlock? in
            guard index.isMultiple(of: 6) else { return nil }
            let source = Evidence(eventIds: [event.id], tArrived: event.tArrived,
                quote: event.text, speakerLabel: event.speakerLabel, tStart: event.tStart)
            return NoteBlock(id: "note-\(index)", kind: "bullet", text: event.text,
                evidence: [source], at: event.tArrived)
        } + images.map { image in
            NoteBlock(id: "image-\(image.id)", kind: "image", text: image.caption,
                evidence: [], at: image.at, imageId: image.id)
        }
        return Meeting(id: id, title: "Synthetic meeting \(id)",
            startedAt: "2026-09-23T09:00:00Z", endedAt: "2026-09-23T10:30:00Z",
            processing: .onDevice, events: events, items: [],
            notes: NotesDocument(method: "extractive", keyPoints: [], topics: [], blocks: blocks),
            images: images)
    }

    private func timed<T>(_ body: () throws -> T) rethrows -> (T, Double) {
        let start = ProcessInfo.processInfo.systemUptime
        let value = try body()
        return (value, (ProcessInfo.processInfo.systemUptime - start) * 1000)
    }

    private func timedAsync<T>(_ body: () async throws -> T) async rethrows -> (T, Double) {
        let start = ProcessInfo.processInfo.systemUptime
        let value = try await body()
        return (value, (ProcessInfo.processInfo.systemUptime - start) * 1000)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["EXCERPT_PHASE7_MEASURE"] == "1"))
    func `measure image heavy save and hundred meeting library`() async throws {
        let fixturePath = ProcessInfo.processInfo.environment["EXCERPT_PHASE7_FIXTURE_ROOT"]
        let root: URL
        if let fixturePath {
            root = URL(fileURLWithPath: fixturePath, isDirectory: true).resolvingSymlinksInPath()
            guard root.path.hasPrefix("/private/tmp/excerpt-phase7-ui-"),
                  !FileManager.default.fileExists(atPath: root.path) else {
                throw CocoaError(.fileWriteInvalidFileName)
            }
        } else {
            root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-\(UUID().uuidString)")
        }
        defer { if fixturePath == nil { try? FileManager.default.removeItem(at: root) } }
        let store = try MeetingStore(root: root)
        if fixturePath != nil {
            try "synthetic-only\n".write(to: root.appending(path: ".excerpt-phase7-fixture"),
                                          atomically: true, encoding: .utf8)
        }
        let png = try screenshot()
        let dataUrl = "data:image/png;base64,\(png.base64EncodedString())"
        let images = (0..<30).map { index in
            MeetingImage(id: "shot-\(index)", dataUrl: dataUrl,
                capturedAt: "2026-09-23T09:00:00Z", at: Double(index * 180_000),
                caption: "Synthetic screen \(index)")
        }
        let heavy = meeting(id: "heavy", minutes: 90, images: images)
        let inlineMeetingBytes = try JSONEncoder.excerpt.encode(heavy).count
        for index in 0..<99 { try store.save(meeting(id: "small-\(index)", minutes: 5)) }

        let (_, saveMs) = try timed { try store.save(heavy) }
        let (listed, listMs) = timed { store.list() }
        let (listPayload, bridgeMs) = try timed { try JSONEncoder.excerpt.encode(listed) }
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let bridge = NotesBridge(store: store, preferences: PreferencesStore(defaults: defaults))
        let (smallList, smallListMs) = try await timedAsync {
            try #require(try await bridge.dispatch("listMeetings") as? String)
        }
        let (searchResult, searchMs) = try await timedAsync {
            try #require(try await bridge.dispatch("searchMeetings", arguments: ["launch timeline"]) as? String)
        }
        let (warmList, warmListMs) = try await timedAsync {
            try #require(try await bridge.dispatch("listMeetings") as? String)
        }
        var searchResident: [UInt64] = []
        let (_, repeatedSearchMs) = try await timedAsync {
            for _ in 0..<10 {
                for _ in 0..<20 {
                    _ = try #require(try await bridge.dispatch("searchMeetings", arguments: ["launch timeline"]) as? String)
                }
                searchResident.append(residentBytes() ?? 0)
            }
        }
        let reopenedBridge = NotesBridge(store: try MeetingStore(root: root),
            preferences: PreferencesStore(defaults: defaults))
        let (_, reopenedListMs) = try await timedAsync {
            try #require(try await reopenedBridge.dispatch("listMeetings") as? String)
        }
        let (loaded, loadMs) = try timed { try store.load(id: heavy.id) }
        let (coldLoaded, coldLoadMs) = try timed { try MeetingStore(root: root).load(id: heavy.id) }
        var edited = loaded
        edited.title = "Synthetic meeting heavy, renamed"
        let (_, editSaveMs) = try timed { try store.save(edited) }
        let mutation = MeetingMutation(operationId: UUID().uuidString, meetingId: heavy.id,
            baseRevision: edited.revision ?? 0,
            baseDocumentRevision: edited.documentRevision ?? 0,
            baseSourceRevision: edited.sourceRevision ?? 0,
            changes: [.setTitle(title: "Synthetic meeting heavy, bridge edit")])
        let mutationBody = String(decoding: try JSONEncoder.excerpt.encode(mutation), as: UTF8.self)
        var publishedBytes = 0
        bridge.onMeetingChange = { publishedBytes += $0.utf8.count }
        let (acknowledgment, mutationMs) = try await timedAsync {
            try #require(try await bridge.dispatch("mutateMeeting", arguments: [mutationBody]) as? String)
        }
        var steadyEditTimes: [Double] = []
        var currentRevision = 1
        for index in 0..<20 {
            let next = MeetingMutation(operationId: UUID().uuidString, meetingId: heavy.id,
                baseRevision: currentRevision, baseDocumentRevision: 0, baseSourceRevision: 0,
                changes: [.setTitle(title: "Synthetic meeting heavy, typed \(index)")])
            let body = String(decoding: try JSONEncoder.excerpt.encode(next), as: UTF8.self)
            let (reply, elapsed) = try await timedAsync {
                try #require(try await bridge.dispatch("mutateMeeting", arguments: [body]) as? String)
            }
            currentRevision = try JSONDecoder.excerpt.decode(MeetingMutationAcknowledgment.self,
                from: Data(reply.utf8)).revision
            steadyEditTimes.append(elapsed)
        }
        let captionBase = try store.load(id: heavy.id)
        let caption = MeetingMutation(operationId: UUID().uuidString, meetingId: heavy.id,
            baseRevision: captionBase.revision ?? 0,
            baseDocumentRevision: captionBase.documentRevision ?? 0,
            baseSourceRevision: captionBase.sourceRevision ?? 0,
            changes: [.updateImage(imageId: "shot-0", caption: "Revised synthetic caption",
                needsReview: nil, anchorAt: nil, timeKnown: nil, blockText: "Revised synthetic caption")])
        let captionBody = String(decoding: try JSONEncoder.excerpt.encode(caption), as: UTF8.self)
        let (_, captionMs) = try await timedAsync {
            try #require(try await bridge.dispatch("mutateMeeting", arguments: [captionBody]) as? String)
        }
        let documentBase = try store.load(id: heavy.id)
        var document = try #require(documentBase.notes)
        document.blocks?[0].text = "Revised synthetic note wording"
        let wording = MeetingMutation(operationId: UUID().uuidString, meetingId: heavy.id,
            baseRevision: documentBase.revision ?? 0,
            baseDocumentRevision: documentBase.documentRevision ?? 0,
            baseSourceRevision: documentBase.sourceRevision ?? 0,
            changes: [.setDocument(document: document, suggestedNotes: nil)])
        let wordingBody = String(decoding: try JSONEncoder.excerpt.encode(wording), as: UTF8.self)
        let (_, wordingMs) = try await timedAsync {
            try #require(try await bridge.dispatch("mutateMeeting", arguments: [wordingBody]) as? String)
        }
        let finalStore = try MeetingStore(root: root)
        let finalMeeting = try finalStore.load(id: heavy.id)
        #expect(finalMeeting.images?.first?.dataUrl == dataUrl)
        #expect(finalMeeting.images?.first?.caption == "Revised synthetic caption")
        #expect(finalMeeting.notes?.blocks?.first?.text == "Revised synthetic note wording")
        #expect(MeetingLibrarySearch.searchRecords(finalStore.libraryRecords(),
            query: "Revised synthetic caption").first?.kind == "moment")
        let meetingFile = root.appending(path: "meetings/heavy.json")
        let meetingBytes = try Data(contentsOf: meetingFile).count
        let assetFiles = try FileManager.default.contentsOfDirectory(
            at: root.appending(path: "meeting-assets/heavy"), includingPropertiesForKeys: nil)
        let assetBytes = try assetFiles.reduce(0) { $0 + (try Data(contentsOf: $1).count) }
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)

        #expect(listed.count == 100)
        #expect(loaded.images?.count == 30)
        #expect(loaded.images?.first?.dataUrl == dataUrl)
        #expect(coldLoaded.images == loaded.images)
        #expect(!acknowledgment.contains(dataUrl))
        #expect(smallList == warmList)
        print("PHASE7_MEASURE png_bytes=\(png.count) inline_meeting_bytes=\(inlineMeetingBytes) "
            + "compact_meeting_bytes=\(meetingBytes) asset_files=\(assetFiles.count) asset_bytes=\(assetBytes) "
            + "full_library_bridge_bytes=\(listPayload.count) small_library_bridge_bytes=\(smallList.utf8.count) "
            + "search_bridge_bytes=\(searchResult.utf8.count) save_ms=\(saveMs) "
            + "list_ms=\(listMs) full_bridge_encode_ms=\(bridgeMs) "
            + "small_list_ms=\(smallListMs) warm_list_ms=\(warmListMs) cold_reopen_list_ms=\(reopenedListMs) "
            + "search_ms=\(searchMs) repeated_search_200_ms=\(repeatedSearchMs) "
            + "search_resident_batches_bytes=\(searchResident.map(String.init).joined(separator: ",")) "
            + "cached_load_ms=\(loadMs) cold_load_ms=\(coldLoadMs) "
            + "title_edit_save_ms=\(editSaveMs) title_edit_logical_bytes_written=\(meetingBytes) "
            + "mutation_request_bytes=\(mutationBody.utf8.count) mutation_ack_bytes=\(acknowledgment.utf8.count) "
            + "mutation_publish_bytes=\(publishedBytes) mutation_ms=\(mutationMs) "
            + "steady_title_20_max_ms=\(steadyEditTimes.max() ?? 0) "
            + "steady_title_20_mean_ms=\(steadyEditTimes.reduce(0, +) / Double(steadyEditTimes.count)) "
            + "caption_edit_ms=\(captionMs) note_edit_ms=\(wordingMs) "
            + "process_peak_rss_bytes=\(usage.ru_maxrss)")
        if ProcessInfo.processInfo.environment["EXCERPT_PHASE7_UNIQUE_ASSETS"] == "1" {
            let uniqueRoot = root.appending(path: "unique")
            let uniqueStore = try MeetingStore(root: uniqueRoot)
            let uniqueImages = try (0..<30).map { index in
                MeetingImage(id: "unique-\(index)",
                    dataUrl: "data:image/png;base64,\(try screenshot(seed: index + 1).base64EncodedString())",
                    capturedAt: "2026-09-23T09:00:00Z", at: Double(index * 180_000),
                    caption: "Unique screen \(index)")
            }
            let uniqueMeeting = meeting(id: "unique-heavy", minutes: 90, images: uniqueImages)
            let ((), uniqueSaveMs) = try timed { try uniqueStore.save(uniqueMeeting) }
            let uniqueFile = uniqueRoot.appending(path: "meetings/unique-heavy.json")
            let uniqueCompactBytes = try Data(contentsOf: uniqueFile).count
            let uniqueAssets = try FileManager.default.contentsOfDirectory(
                at: uniqueRoot.appending(path: "meeting-assets/unique-heavy"), includingPropertiesForKeys: nil)
            let uniqueAssetBytes = try uniqueAssets.reduce(0) { $0 + (try Data(contentsOf: $1).count) }
            var renamed = uniqueMeeting
            renamed.title = "Unique image meeting, renamed"
            let ((), uniqueEditMs) = try timed { try uniqueStore.save(renamed) }
            #expect(uniqueAssets.count == 30)
            #expect(try MeetingStore(root: uniqueRoot).load(id: uniqueMeeting.id).images == uniqueImages)
            print("PHASE7_UNIQUE_ASSETS asset_files=\(uniqueAssets.count) asset_bytes=\(uniqueAssetBytes) "
                + "compact_meeting_bytes=\(uniqueCompactBytes) initial_save_ms=\(uniqueSaveMs) "
                + "title_edit_ms=\(uniqueEditMs)")
        }
    }
}
