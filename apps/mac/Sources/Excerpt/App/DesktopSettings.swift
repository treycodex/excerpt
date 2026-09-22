import Foundation

struct CaptionDisplay: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var connected: Bool = true
}

struct CaptionSettings: Codable, Equatable, Sendable {
    var preset: CaptionPreset
    var size: CaptionSize
    var position: CaptionPosition
    var enabled: Bool
    var displayId: String
    var displays: [CaptionDisplay]
    var displayMissing: Bool
    var displayName: String
    /// The overlay is deliberately capturable. This is a statement of current
    /// behaviour, not a promise that it is hidden from screen sharing.
    var capturable = true
}

enum MeetingShortcutName: String, Codable, CaseIterable, Sendable {
    case meeting, captions, catchUp, capture
}

struct MeetingShortcutStatus: Codable, Equatable, Sendable {
    var name: MeetingShortcutName
    var label: String
    var shortcut: String
    var registered: Bool
    var relevant: Bool
}

struct DesktopSettings: Codable, Equatable, Sendable {
    var captions: CaptionSettings
    var microphone: MicrophoneSettings
    var shortcuts: [MeetingShortcutStatus]
}
