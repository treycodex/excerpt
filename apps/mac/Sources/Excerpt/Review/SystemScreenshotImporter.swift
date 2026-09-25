import CoreFoundation
import Darwin
import Foundation

/// Imports only new, saved macOS screenshots while a meeting is listening. The
/// system owns its ⌘⇧3/4/5 UI; Excerpt never activates or opens a second picker.
/// Files already in the screenshot folder are baselined, and the screenshot xattr
/// distinguishes a user-taken capture from an arbitrary image saved there.
@MainActor
final class SystemScreenshotImporter {
    typealias Directory = @MainActor () -> URL?
    typealias IsScreenshot = @MainActor (URL) -> Bool

    private struct FileVersion: Equatable {
        let size: Int
        let modified: Date?
    }

    private struct Observation {
        let meetingID: String
        var directory: URL
        let startedAt: Date
        let onCapture: @MainActor (String, MeetingScreenshot.Capture) -> Void
        let onFailure: @MainActor (Error) -> Void
        var seen: Set<URL>
        var pending: [URL: FileVersion] = [:]
        var failedReads: [URL: Int] = [:]
    }

    private let directory: Directory
    private let isScreenshot: IsScreenshot
    private let pollInterval: Duration
    private var observation: Observation?
    private var polling: Task<Void, Never>?
    var onAvailabilityChange: (@MainActor () -> Void)?
    private(set) var unavailableReason: String? {
        didSet { if unavailableReason != oldValue { onAvailabilityChange?() } }
    }

    var isWatching: Bool { observation != nil }

    init(
        directory: @escaping Directory = { SystemScreenshotImporter.systemScreenshotDirectory() },
        isScreenshot: @escaping IsScreenshot = { SystemScreenshotImporter.hasSystemScreenshotMarker($0) },
        pollInterval: Duration = .milliseconds(750)
    ) {
        self.directory = directory
        self.isScreenshot = isScreenshot
        self.pollInterval = pollInterval
    }

    func start(
        meetingID: String,
        onCapture: @escaping @MainActor (String, MeetingScreenshot.Capture) -> Void,
        onFailure: @escaping @MainActor (Error) -> Void
    ) {
        if observation?.meetingID == meetingID { return }
        stop()
        guard let folder = directory()?.standardizedFileURL else {
            unavailableReason = "Set macOS Screenshot to save to a folder; Clipboard and app destinations cannot be imported."
            return
        }
        guard let existing = try? imageFiles(in: folder) else {
            unavailableReason = "Excerpt cannot read the macOS screenshot folder. Check folder access in System Settings."
            return
        }
        unavailableReason = nil
        observation = Observation(
            meetingID: meetingID, directory: folder, startedAt: Date(),
            onCapture: onCapture, onFailure: onFailure,
            seen: Set(existing))
        polling = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: self?.pollInterval ?? .seconds(1)) }
                catch { break }
                self?.scan()
            }
        }
    }

    /// Also called just before End so a completed file is not lost to the timer.
    func scan() {
        guard var current = observation else { return }
        guard let folder = directory()?.standardizedFileURL else {
            unavailableReason = "Set macOS Screenshot to save to a folder; Clipboard and app destinations cannot be imported."
            return
        }
        guard let files = try? imageFiles(in: folder) else {
            unavailableReason = "Excerpt cannot read the macOS screenshot folder. Check folder access in System Settings."
            return
        }
        unavailableReason = nil
        if folder != current.directory {
            current.directory = folder
            current.pending.removeAll()
            current.failedReads.removeAll()
        }
        for url in files where !current.seen.contains(url) {
            guard let values = try? url.resourceValues(forKeys: [
                .isRegularFileKey, .creationDateKey, .contentModificationDateKey, .fileSizeKey
            ]), values.isRegularFile == true,
                  let capturedAt = values.creationDate ?? values.contentModificationDate,
                  capturedAt >= current.startedAt.addingTimeInterval(-1),
                  isScreenshot(url) else { continue }

            let size = values.fileSize ?? 0
            guard size > 0 else { continue }
            let version = FileVersion(size: size, modified: values.contentModificationDate)
            guard current.pending[url] == version else {
                current.pending[url] = version
                current.failedReads.removeValue(forKey: url)
                continue
            }
            do {
                guard size <= 20 * 1024 * 1024 else { throw Failure.unreadable }
                let capture = try MeetingScreenshot.fromData(
                    Data(contentsOf: url), capturedAt: capturedAt, origin: "system-screenshot")
                current.seen.insert(url)
                current.pending.removeValue(forKey: url)
                current.onCapture(current.meetingID, capture)
            } catch {
                // A screenshot can be visible in the folder before its write is
                // complete. Give it a few scans to settle before reporting failure.
                let failures = (current.failedReads[url] ?? 0) + 1
                current.failedReads[url] = failures
                if failures >= 3 || size > 20 * 1024 * 1024 {
                    current.seen.insert(url)
                    current.pending.removeValue(forKey: url)
                    current.failedReads.removeValue(forKey: url)
                    current.onFailure(Failure.unreadable)
                }
            }
        }
        // A callback may have ended the meeting while this scan was running.
        if observation?.meetingID == current.meetingID { observation = current }
    }

    func stop() {
        polling?.cancel()
        polling = nil
        observation = nil
        unavailableReason = nil
    }

    private func imageFiles(in folder: URL) throws -> [URL] {
        try FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        ).filter { ["png", "jpg", "jpeg", "heic", "heif", "tif", "tiff"].contains($0.pathExtension.lowercased()) }
    }

    private static func systemScreenshotDirectory() -> URL? {
        if let path = CFPreferencesCopyAppValue(
            "location" as CFString, "com.apple.screencapture" as CFString
        ) as? String, !path.isEmpty {
            guard path.hasPrefix("/") else { return nil } // Clipboard, Preview, etc.
            return URL(fileURLWithPath: path, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appending(path: "Desktop", directoryHint: .isDirectory)
    }

    private static func hasSystemScreenshotMarker(_ url: URL) -> Bool {
        url.path.withCString { path in
            getxattr(path, "com.apple.metadata:kMDItemIsScreenCapture", nil, 0, 0, 0) > 0
        }
    }

    enum Failure: LocalizedError {
        case unreadable
        var errorDescription: String? {
            "The saved macOS screenshot could not be read. Check its file and try another screenshot."
        }
    }
}
