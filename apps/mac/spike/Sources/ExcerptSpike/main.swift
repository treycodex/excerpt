import AppKit

// A spike, not a product: one window, one button per gate, and a log that says
// what was measured rather than what was assumed.
let app = NSApplication.shared
let delegate = SpikeAppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
