// Waits until the named app is frontmost (the person switched to the shoot desktop
// and clicked it), then exits. Used to start a take hands-free.
import AppKit
let want = CommandLine.arguments.dropFirst().first ?? "com.excerpt.app"
while NSWorkspace.shared.frontmostApplication?.bundleIdentifier != want {
    RunLoop.current.run(until: Date().addingTimeInterval(0.3))
}
print("front: \(want)")
