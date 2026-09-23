import AVFoundation
import Foundation
import Observation

struct MicrophoneDevice: Codable, Equatable, Identifiable, Sendable {
    var id: String
    var name: String
    var connected: Bool = true
}

enum MicrophoneHealth: String, Codable, Sendable {
    case ready, starting, hearing, silent, stalled, failed, missing
}

struct MicrophoneSettings: Codable, Equatable, Sendable {
    var selectedDeviceId: String
    var devices: [MicrophoneDevice]
    var health: MicrophoneHealth
    var message: String
    var selectionLocked = false
}

protocol MicrophoneDiscovering: Sendable {
    func devices() -> [MicrophoneDevice]
    func defaultDeviceID() -> String?
}

struct NativeMicrophoneDiscovery: MicrophoneDiscovering {
    func devices() -> [MicrophoneDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.microphone, .external],
            mediaType: .audio, position: .unspecified).devices
            .map { MicrophoneDevice(id: $0.uniqueID, name: $0.localizedName) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    func defaultDeviceID() -> String? { AVCaptureDevice.default(for: .audio)?.uniqueID }
}

enum MicrophoneSelectionError: LocalizedError {
    case unavailable
    case inUse
    case missing(String)

    var errorDescription: String? {
        switch self {
        case .inUse:
            "End the meeting or stop the input check before changing microphones."
        case .unavailable:
            "No microphone is connected. Connect one or choose another input in Excerpt Settings."
        case .missing(let name):
            "The selected microphone, \(name), is disconnected. Reconnect it or choose another input in Excerpt Settings."
        }
    }
}

/// Native is the sole owner of input selection. The stable AVCaptureDevice unique ID
/// is persisted even while the device is absent, so Excerpt never silently relabels a
/// different microphone as the user's voice.
@MainActor
@Observable
final class MicrophoneController {
    private enum Key {
        static let selected = "audio.microphone.device-id"
        static let selectedName = "audio.microphone.device-name"
    }

    private let defaults: UserDefaults
    private let discovery: any MicrophoneDiscovering
    private(set) var devices: [MicrophoneDevice] = []
    private(set) var selectedDeviceID: String
    private(set) var selectedDeviceName: String
    var selectionLocked = false {
        didSet { if oldValue != selectionLocked { onChange?() } }
    }
    @ObservationIgnored private var deviceObserver: MicrophoneDeviceObserver?
    @ObservationIgnored var onChange: (() -> Void)?

    init(defaults: UserDefaults = .standard,
         discovery: any MicrophoneDiscovering = NativeMicrophoneDiscovery()) {
        self.defaults = defaults
        self.discovery = discovery
        let available = discovery.devices()
        devices = available
        let persisted = defaults.string(forKey: Key.selected)
        let initial = persisted ?? discovery.defaultDeviceID() ?? available.first?.id ?? ""
        selectedDeviceID = initial
        selectedDeviceName = defaults.string(forKey: Key.selectedName)
            ?? available.first(where: { $0.id == initial })?.name
            ?? "Selected microphone"
        deviceObserver = MicrophoneDeviceObserver { [weak self] in self?.refresh() }
        if persisted == nil, !initial.isEmpty {
            defaults.set(initial, forKey: Key.selected)
            defaults.set(selectedDeviceName, forKey: Key.selectedName)
        }
    }

    func refresh() {
        let next = discovery.devices()
        guard next != devices else { return }
        devices = next
        if selectedDeviceID.isEmpty, let initial = next.first(where: { $0.id == discovery.defaultDeviceID() }) ?? next.first {
            selectedDeviceID = initial.id
            selectedDeviceName = initial.name
            defaults.set(initial.id, forKey: Key.selected)
            defaults.set(initial.name, forKey: Key.selectedName)
        }
        onChange?()
    }

    func select(_ id: String) throws {
        guard !selectionLocked else { throw MicrophoneSelectionError.inUse }
        refresh()
        guard let device = devices.first(where: { $0.id == id }) else {
            throw MicrophoneSelectionError.missing(selectedDeviceName)
        }
        selectedDeviceID = device.id
        selectedDeviceName = device.name
        defaults.set(device.id, forKey: Key.selected)
        defaults.set(device.name, forKey: Key.selectedName)
        onChange?()
    }

    func selectedDeviceIDForCapture() throws -> String {
        refresh()
        guard !devices.isEmpty else { throw MicrophoneSelectionError.unavailable }
        guard devices.contains(where: { $0.id == selectedDeviceID }) else {
            throw MicrophoneSelectionError.missing(selectedDeviceName)
        }
        return selectedDeviceID
    }

    func snapshot(liveHealth: SourceHealth? = nil) -> MicrophoneSettings {
        let connected = devices.contains(where: { $0.id == selectedDeviceID })
        guard connected else {
            return MicrophoneSettings(
                selectedDeviceId: selectedDeviceID, devices: devices, health: .missing,
                message: devices.isEmpty
                    ? "No microphone is connected."
                    : "\(selectedDeviceName) is disconnected. Reconnect it or choose another input.", selectionLocked: selectionLocked)
        }

        let health: MicrophoneHealth
        let message: String
        switch liveHealth {
        case .starting: health = .starting; message = "Starting the selected microphone…"
        case .hearing: health = .hearing; message = "Hearing your selected microphone."
        case .silent: health = .silent; message = "Connected. No voice detected just now."
        case .stalled: health = .stalled; message = "Sound is arriving, but speech is not being recognised."
        case .failed: health = .failed; message = "The selected microphone has stopped working."
        case nil: health = .ready; message = "Connected and ready."
        }
        return MicrophoneSettings(
            selectedDeviceId: selectedDeviceID, devices: devices, health: health, message: message, selectionLocked: selectionLocked)
    }
}

/// Notifications update all open settings surfaces even while no meeting is running.
private final class MicrophoneDeviceObserver {
    private var tokens: [NSObjectProtocol] = []
    init(onChange: @escaping @MainActor @Sendable () -> Void) {
        tokens = [AVCaptureDevice.wasConnectedNotification, AVCaptureDevice.wasDisconnectedNotification].map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { onChange() }
            }
        }
    }
    deinit { tokens.forEach(NotificationCenter.default.removeObserver) }
}
