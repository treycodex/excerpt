import Carbon
import Foundation

/// Registered shortcuts work while the meeting app is focused, without a key logger
/// or an additional Accessibility permission.
@MainActor
final class MeetingShortcuts {
    private var handler: EventHandlerRef?
    private var hotkeys: [EventHotKeyRef] = []
    var onCatchUp: (() -> Void)?
    var onScreenshot: (() -> Void)?

    func register() -> Bool {
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        let result = InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var id = EventHotKeyID()
            let status = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            guard status == noErr else { return status }
            let owner = Unmanaged<MeetingShortcuts>.fromOpaque(context).takeUnretainedValue()
            MainActor.assumeIsolated {
                if id.id == 1 { owner.onCatchUp?() }
                if id.id == 2 { owner.onScreenshot?() }
            }
            return noErr
        }, 1, &event, context, &handler)
        guard result == noErr else { return false }
        var successful = true
        for (id, key) in [(UInt32(1), UInt32(kVK_ANSI_J)), (UInt32(2), UInt32(kVK_ANSI_S))] {
            var reference: EventHotKeyRef?
            let status = RegisterEventHotKey(key, UInt32(cmdKey | shiftKey), EventHotKeyID(signature: 0x45584350, id: id), GetApplicationEventTarget(), 0, &reference)
            if status == noErr, let reference { hotkeys.append(reference) } else { successful = false }
        }
        return successful
    }

    func unregister() {
        for hotkey in hotkeys { UnregisterEventHotKey(hotkey) }
        hotkeys.removeAll()
        if let handler { RemoveEventHandler(handler) }
        handler = nil
    }
}
