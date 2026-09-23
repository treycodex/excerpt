import AppKit
import Darwin
import Foundation
import Testing
@testable import Excerpt

/// Opt-in measurement, not a timing assertion. Every byte stays in an isolated
/// temporary MeetingStore; this never reads the user's Excerpt directory.
@MainActor
struct Phase7MetricsTests {
    private func screenshot() throws -> Data {
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
        let root = URL(filePath: NSTemporaryDirectory()).appending(path: "excerpt-phase7-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try MeetingStore(root: root)
        let png = try screenshot()
        let dataUrl = "data:image/png;base64,\(png.base64EncodedString())"
        let images = (0..<30).map { index in
            MeetingImage(id: "shot-\(index)", dataUrl: dataUrl,
                capturedAt: "2026-09-23T09:00:00Z", at: Double(index * 180_000),
                caption: "Synthetic screen \(index)")
        }
        let heavy = meeting(id: "heavy", minutes: 90, images: images)
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
        let (loaded, loadMs) = try timed { try store.load(id: heavy.id) }
        var edited = loaded
        edited.title = "Synthetic meeting heavy, renamed"
        let (_, editSaveMs) = try timed { try store.save(edited) }
        let meetingFile = root.appending(path: "meetings/heavy.json")
        let meetingBytes = try Data(contentsOf: meetingFile).count
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)

        #expect(listed.count == 100)
        #expect(loaded.images?.count == 30)
        #expect(loaded.images?.first?.dataUrl == dataUrl)
        print("PHASE7_MEASURE png_bytes=\(png.count) heavy_json_bytes=\(meetingBytes) "
            + "full_library_bridge_bytes=\(listPayload.count) small_library_bridge_bytes=\(smallList.utf8.count) "
            + "search_bridge_bytes=\(searchResult.utf8.count) save_ms=\(saveMs) "
            + "list_ms=\(listMs) full_bridge_encode_ms=\(bridgeMs) "
            + "small_list_ms=\(smallListMs) search_ms=\(searchMs) load_ms=\(loadMs) "
            + "title_edit_save_ms=\(editSaveMs) title_edit_logical_bytes_written=\(meetingBytes) "
            + "process_peak_rss_bytes=\(usage.ru_maxrss)")
    }
}
