import CoreGraphics
import Foundation

// Prints `id x y w h` for the named app's main window — but only if that window is
// the frontmost thing on screen.
//
// record-media.sh used to record a hardcoded rectangle and trust that Excerpt was
// behind it. When it was not, the recording captured whatever app happened to be
// there and the result looked plausible enough to ship. Failing loudly is the whole
// point of this file: a screenshot tool that quietly photographs the wrong window is
// worse than one that does not run.
let wanted = CommandLine.arguments.dropFirst().first ?? "Excerpt"
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

// Front to back, ordinary app windows only.
let ordinary = windows.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }

guard let front = ordinary.first else {
    FileHandle.standardError.write(Data("no on-screen windows\n".utf8))
    exit(1)
}
guard (front[kCGWindowOwnerName as String] as? String) == wanted else {
    let owner = front[kCGWindowOwnerName as String] as? String ?? "?"
    FileHandle.standardError.write(Data("frontmost window belongs to \(owner), not \(wanted)\n".utf8))
    exit(1)
}
guard let id = front[kCGWindowNumber as String] as? Int,
      let bounds = front[kCGWindowBounds as String] as? [String: Double],
      let x = bounds["X"], let y = bounds["Y"], let w = bounds["Width"], let h = bounds["Height"] else {
    FileHandle.standardError.write(Data("could not read the window's bounds\n".utf8))
    exit(1)
}
print("\(id) \(Int(x)) \(Int(y)) \(Int(w)) \(Int(h))")
