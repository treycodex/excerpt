import AppKit
import Foundation

/// Uses macOS's region picker. Only an explicit Excerpt action invokes it.
@MainActor
enum MeetingScreenshot {
    struct Capture { var dataURL: String; var capturedAt: Date }
    enum Failure: LocalizedError {
        case unreadable
        var errorDescription: String? { "The screenshot could not be read. Check Screen Recording permission and try again." }
    }

    static func captureRegion() async throws -> Capture? {
        let url = FileManager.default.temporaryDirectory.appending(path: "excerpt-shot-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: url) }
        let process = Process()
        process.executableURL = URL(filePath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-x", "-t", "png", url.path]
        let status: Int32 = try await withCheckedThrowingContinuation { continuation in
            process.terminationHandler = { task in continuation.resume(returning: task.terminationStatus) }
            do { try process.run() } catch { continuation.resume(throwing: error) }
        }
        // Escape is an ordinary cancellation; it never inserts an empty image.
        guard FileManager.default.fileExists(atPath: url.path) else {
            if status == 0 || status == 1 { return nil }
            throw Failure.unreadable
        }
        let capturedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        return try fromData(Data(contentsOf: url), capturedAt: capturedAt)
    }

    static func fromData(_ input: Data, capturedAt: Date = Date()) throws -> Capture {
        guard input.count <= 20 * 1024 * 1024, let bitmap = NSBitmapImageRep(data: input) else { throw Failure.unreadable }
        let scale = min(1, 2400 / Double(max(bitmap.pixelsWide, bitmap.pixelsHigh)))
        let size = NSSize(width: Double(bitmap.pixelsWide) * scale, height: Double(bitmap.pixelsHigh) * scale)
        guard let target = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: max(1, Int(size.width)), pixelsHigh: max(1, Int(size.height)), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let context = NSGraphicsContext(bitmapImageRep: target) else { throw Failure.unreadable }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        NSColor.white.setFill(); NSRect(origin: .zero, size: size).fill()
        bitmap.draw(in: NSRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()
        guard let data = target.representation(using: .jpeg, properties: [.compressionFactor: 0.9]) else { throw Failure.unreadable }
        return Capture(dataURL: "data:image/jpeg;base64,\(data.base64EncodedString())", capturedAt: capturedAt)
    }
}
