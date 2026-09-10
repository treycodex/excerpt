import AppKit

/// Whether Excerpt appears in the Dock.
///
/// Stage 0 measured that the overlay only draws over a fullscreen app while Excerpt is
/// an *accessory* app — a Dock icon and captions over a fullscreen meeting are mutually
/// exclusive (SPIKE-RESULTS finding 9). Rather than pick one forever, the icon follows
/// the windows:
///
/// ```
/// overlay showing            -> .accessory   (no Dock icon)
/// a notes or setup window up -> .regular     (Dock icon)
/// neither                    -> .accessory
/// ```
///
/// Which reads, from the outside, as: Excerpt is in the Dock while it is an app you are
/// using, and gets out of the way while it is a layer over your meeting.
///
/// One owner. Nothing else calls `setActivationPolicy`, so there is never a second
/// opinion about which mode the app is in — and changing the rule means changing one
/// function rather than hunting for the other caller.
@MainActor
final class DockPresence {
    static let shared = DockPresence()

    /// Weak, so a closed window that nobody else retains does not keep the Dock icon.
    private let tracked = NSHashTable<NSWindow>.weakObjects()
    private var overlayShowing = false
    /// The gate harness measures each mode deliberately. While it is doing that, the
    /// rule steps aside rather than fighting it.
    private var forced: NSApplication.ActivationPolicy?

    /// Called after the policy actually changes, because the overlay window has to be
    /// rebuilt to pick up the new mode.
    var onChange: (() -> Void)?

    private init() {}

    // MARK: - Inputs

    func track(_ window: NSWindow) {
        guard !tracked.contains(window) else { apply(); return }
        tracked.add(window)
        // willClose rather than a delegate: these windows already have delegates, and
        // taking one over to learn a single fact is how a controller loses its own.
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: window, queue: .main
        ) { [weak window] _ in
            MainActor.assumeIsolated {
                if let window { DockPresence.shared.tracked.remove(window) }
                DockPresence.shared.apply()
            }
        }
        apply()
    }

    func overlay(isShowing: Bool) {
        guard overlayShowing != isShowing else { return }
        overlayShowing = isShowing
        apply()
    }

    /// Pins the policy, for the diagnostics window. `nil` hands it back to the rule.
    func force(_ policy: NSApplication.ActivationPolicy?) {
        forced = policy
        apply()
    }

    var isForced: Bool { forced != nil }

    // MARK: - The rule

    var policy: NSApplication.ActivationPolicy {
        if let forced { return forced }
        if overlayShowing { return .accessory }
        return tracked.allObjects.contains(where: \.isVisible) ? .regular : .accessory
    }

    func apply() {
        let wanted = policy
        guard NSApp.activationPolicy() != wanted else { return }
        NSApp.setActivationPolicy(wanted)

        // Becoming a regular app does not bring the app forward on its own, and a
        // window that prompted the change should be reachable once it is there.
        if wanted == .regular { NSApp.activate(ignoringOtherApps: false) }
        onChange?()
    }
}
