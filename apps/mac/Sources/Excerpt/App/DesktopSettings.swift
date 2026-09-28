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
    var screenshotImport = ScreenshotImportSettings(enabled: false, folderName: nil)
}

struct ScreenshotImportSettings: Codable, Equatable, Sendable {
    var enabled: Bool
    var folderName: String?
}

struct CaptionSettingsPatch: Codable, Sendable {
    var preset: CaptionPreset?
    var size: CaptionSize?
    var position: CaptionPosition?
    var enabled: Bool?
    var displayId: String?

    func applying(to current: CaptionSettings) -> CaptionSettings {
        var result = current
        if let preset { result.preset = preset }
        if let size { result.size = size }
        if let position { result.position = position }
        if let enabled { result.enabled = enabled }
        if let displayId { result.displayId = displayId }
        return result
    }
}

enum MeetingCommandError: LocalizedError {
    case unavailable(String)
    var errorDescription: String? {
        switch self { case .unavailable(let message): message }
    }
}
