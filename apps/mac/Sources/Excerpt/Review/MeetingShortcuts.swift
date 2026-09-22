import Carbon
import Foundation

/// Global meeting controls. Menu items deliberately have no key equivalents for
/// these keys, so a physical press has one Carbon delivery instead of a Carbon event
/// plus an AppKit menu action.
@MainActor
final class MeetingShortcuts {
    private struct Definition {
        var name: MeetingShortcutName
        var id: UInt32
        var key: UInt32
        var label: String
        var shortcut: String
        var contextual: Bool
    }

    private static let definitions: [Definition] = [
        Definition(name: .meeting, id: 1, key: UInt32(kVK_ANSI_R), label: "Start or end meeting", shortcut: "⌘⇧R", contextual: false),
        Definition(name: .captions, id: 2, key: UInt32(kVK_ANSI_C), label: "Show or hide captions", shortcut: "⌘⇧C", contextual: false),
        Definition(name: .catchUp, id: 3, key: UInt32(kVK_ANSI_J), label: "Catch up", shortcut: "⌘⇧J", contextual: true),
        Definition(name: .capture, id: 4, key: UInt32(kVK_ANSI_S), label: "Capture moment", shortcut: "⌘⇧S", contextual: true),
    ]

    private var handler: EventHandlerRef?
    private var hotkeys: [MeetingShortcutName: EventHotKeyRef] = [:]
    private var registered: Set<MeetingShortcutName> = []
    private var meetingActive = false
    private let registerOverride: ((MeetingShortcutName) -> Bool)?
    private let unregisterOverride: ((MeetingShortcutName) -> Void)?

    var onMeeting: (() -> Void)?
    var onCaptions: (() -> Void)?
    var onCatchUp: (() -> Void)?
    var onScreenshot: (() -> Void)?
    var onStatusChange: (() -> Void)?

    init(register: ((MeetingShortcutName) -> Bool)? = nil,
         unregister: ((MeetingShortcutName) -> Void)? = nil) {
        registerOverride = register
        unregisterOverride = unregister
    }

    func registerCore() {
        installHandlerIfNeeded()
        setRelevant(.meeting, true)
        setRelevant(.captions, true)
    }

    func setMeetingActive(_ active: Bool) {
        guard meetingActive != active else { return }
        meetingActive = active
        setRelevant(.catchUp, active)
        setRelevant(.capture, active)
        onStatusChange?()
    }

    func statuses() -> [MeetingShortcutStatus] {
        Self.definitions.map { definition in
            MeetingShortcutStatus(
                name: definition.name, label: definition.label, shortcut: definition.shortcut,
                registered: registered.contains(definition.name),
                relevant: !definition.contextual || meetingActive)
        }
    }

    func unregister() {
        for definition in Self.definitions { unregister(definition.name) }
        if let handler { RemoveEventHandler(handler) }
        handler = nil
        onStatusChange?()
    }

    func perform(_ name: MeetingShortcutName) {
        guard registered.contains(name) else { return }
        switch name {
        case .meeting: onMeeting?()
        case .captions: onCaptions?()
        case .catchUp where meetingActive: onCatchUp?()
        case .capture where meetingActive: onScreenshot?()
        case .catchUp, .capture: break
        }
    }

    private func installHandlerIfNeeded() {
        guard handler == nil, registerOverride == nil else { return }
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var id = EventHotKeyID()
            let status = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            guard status == noErr,
                  let definition = MeetingShortcuts.definitions.first(where: { $0.id == id.id }) else { return status }
            let owner = Unmanaged<MeetingShortcuts>.fromOpaque(context).takeUnretainedValue()
            MainActor.assumeIsolated { owner.perform(definition.name) }
            return noErr
        }, 1, &event, context, &handler)
    }

    private func setRelevant(_ name: MeetingShortcutName, _ relevant: Bool) {
        if relevant { register(name) } else { unregister(name) }
    }

    private func register(_ name: MeetingShortcutName) {
        guard !registered.contains(name),
              let definition = Self.definitions.first(where: { $0.name == name }) else { return }
        let success: Bool
        if let registerOverride {
            success = registerOverride(name)
        } else {
            var reference: EventHotKeyRef?
            let status = RegisterEventHotKey(
                definition.key, UInt32(cmdKey | shiftKey),
                EventHotKeyID(signature: 0x45584350, id: definition.id),
                GetApplicationEventTarget(), 0, &reference)
            success = status == noErr && reference != nil
            if let reference { hotkeys[name] = reference }
        }
        if success { registered.insert(name) }
        onStatusChange?()
    }

    private func unregister(_ name: MeetingShortcutName) {
        unregisterOverride?(name)
        if let reference = hotkeys.removeValue(forKey: name) { UnregisterEventHotKey(reference) }
        registered.remove(name)
    }
}
