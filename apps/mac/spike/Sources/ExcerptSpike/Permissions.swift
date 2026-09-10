import AVFoundation
import CoreGraphics
import ScreenCaptureKit
import Speech

/// Three separate grants. One capture stream does not merge them, and pretending
/// otherwise is how a setup flow ends up with a dead end and no explanation.
enum Permission: String, CaseIterable {
    case microphone = "Microphone"
    case screenRecording = "Screen recording"
    case speech = "Speech recognition"

    enum State: String { case granted, denied, undetermined, unknown }
}

enum Permissions {
    static func state(of permission: Permission) async -> Permission.State {
        switch permission {
        case .microphone:
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .authorized: return .granted
            case .denied, .restricted: return .denied
            case .notDetermined: return .undetermined
            @unknown default: return .unknown
            }

        case .speech:
            switch SFSpeechRecognizer.authorizationStatus() {
            case .authorized: return .granted
            case .denied, .restricted: return .denied
            case .notDetermined: return .undetermined
            @unknown default: return .unknown
            }

        case .screenRecording:
            // CGPreflightScreenCaptureAccess is the status check. SCShareableContent
            // is NOT a request API — using it as one reports denied forever without
            // ever showing the user a prompt.
            return CGPreflightScreenCaptureAccess() ? .granted : .denied
        }
    }

    /// Requests one permission. Returns the state afterwards so the caller can
    /// explain the consequence rather than silently failing.
    static func request(_ permission: Permission) async -> Permission.State {
        switch permission {
        case .microphone:
            _ = await AVCaptureDevice.requestAccess(for: .audio)
        case .speech:
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                SFSpeechRecognizer.requestAuthorization { _ in c.resume() }
            }
        case .screenRecording:
            // The real request. Returns immediately; the grant only takes effect
            // after the app is relaunched, which the caller must tell the user.
            _ = CGRequestScreenCaptureAccess()
        }
        return await state(of: permission)
    }
}
