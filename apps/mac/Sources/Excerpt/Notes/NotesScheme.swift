import Foundation
import OSLog
import UniformTypeIdentifiers
import WebKit

/// Serves the bundled notes editor over `excerpt://notes/…`.
///
/// Not `file://`, though the files are local either way. A page loaded from a file
/// URL has an opaque origin, and an opaque origin cannot load ES modules — which is
/// every script Vite emits. The window comes up blank with no error anywhere the user
/// or the app can see it. A custom scheme gives the same local files a real origin,
/// so modules load, while still reaching nothing but this app's own bundle.
final class NotesSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "excerpt"
    static let origin = "excerpt://notes"

    private let root: URL
    private let log = Logger(subsystem: "com.excerpt.app", category: "notes")

    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url, let file = resolve(url) else {
            task.didFailWithError(URLError(.badURL))
            return
        }

        do {
            let data = try Data(contentsOf: file)
            let response = URLResponse(
                url: url,
                mimeType: Self.mimeType(of: file),
                expectedContentLength: data.count,
                textEncodingName: "utf-8"
            )
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
        } catch {
            log.error("notes asset missing: \(file.lastPathComponent)")
            task.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
        // Every response is served synchronously from disk, so there is nothing in
        // flight to cancel.
    }

    /// Maps a request onto a file inside the bundle, and only inside it. Path
    /// components are resolved before the check, so `../` cannot climb out.
    private func resolve(_ url: URL) -> URL? {
        var path = url.path(percentEncoded: false)
        if path.isEmpty || path == "/" { path = "/index.html" }

        let candidate = root.appending(path: path).standardizedFileURL
        guard candidate.path(percentEncoded: false)
            .hasPrefix(root.standardizedFileURL.path(percentEncoded: false)) else { return nil }
        return candidate
    }

    private static func mimeType(of file: URL) -> String {
        UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    }
}
