import AppKit

// A spike, not a product: one window, one button per gate, and a log that says
// what was measured rather than what was assumed.
//
// `@main` on the delegate looks tidier and does not work here: AppKit never adopts the
// instance, so no window, no status item and no callbacks — measured, the app launched
// with nothing but a menu bar. An explicit entry point keeps the delegate alive in a
// global (NSApplication holds its delegate weakly) and states where the main actor is.
let delegate = MainActor.assumeIsolated { AppDelegate() }

MainActor.assumeIsolated {
    let app = NSApplication.shared
    app.delegate = delegate
    app.run()
}
