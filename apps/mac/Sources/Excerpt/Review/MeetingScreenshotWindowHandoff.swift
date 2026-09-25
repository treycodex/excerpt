import AppKit

/// Keeps Excerpt out of macOS's region picker, then restores only the windows
/// that were visible before the shortcut. Restoration is also used if End or
/// Quit cancels a picker before its normal completion callback.
@MainActor
final class MeetingScreenshotWindowHandoff {
    private let isHidden: @MainActor () -> Bool
    private let isActive: @MainActor () -> Bool
    private let hide: @MainActor () -> Void
    private let unhide: @MainActor () -> Void
    private let unhideWithoutActivation: @MainActor () -> Void
    private var restoration: (wasVisible: Bool, wasActive: Bool)?

    init(
        isHidden: @escaping @MainActor () -> Bool = { NSApp.isHidden },
        isActive: @escaping @MainActor () -> Bool = { NSApp.isActive },
        hide: @escaping @MainActor () -> Void = { NSApp.hide(nil) },
        unhide: @escaping @MainActor () -> Void = { NSApp.unhide(nil) },
        unhideWithoutActivation: @escaping @MainActor () -> Void = { NSApp.unhideWithoutActivation() }
    ) {
        self.isHidden = isHidden
        self.isActive = isActive
        self.hide = hide
        self.unhide = unhide
        self.unhideWithoutActivation = unhideWithoutActivation
    }

    func begin() {
        guard restoration == nil else { return }
        let wasVisible = !isHidden()
        restoration = (wasVisible: wasVisible, wasActive: isActive())
        if wasVisible { hide() }
    }

    func restore() {
        guard let prior = restoration else { return }
        restoration = nil
        guard prior.wasVisible else { return }
        if prior.wasActive { unhide() }
        else { unhideWithoutActivation() }
    }
}
