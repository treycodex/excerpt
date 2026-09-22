import Foundation

/// Owns the one interactive region picker. Cancellation is explicit and never waits
/// for user input; a late capture is discarded by request identity before it can be
/// attached to a later meeting.
@MainActor
final class MeetingScreenshotCoordinator {
    typealias Capture = @MainActor () async throws -> MeetingScreenshot.Capture?

    private var task: Task<Void, Never>?
    private var requestID: UUID?
    var onChange: (() -> Void)?

    var isCapturing: Bool { task != nil }

    func start(
        meetingID: String,
        capture: @escaping Capture = { try await MeetingScreenshot.captureRegion() },
        onCapture: @escaping (String, MeetingScreenshot.Capture) -> Void,
        onFailure: @escaping (Error) -> Void,
        onComplete: @escaping () -> Void = {}
    ) {
        guard task == nil else { return }
        let requestID = UUID()
        self.requestID = requestID
        task = Task { [weak self] in
            do {
                if let result = try await capture(), !Task.isCancelled,
                   self?.requestID == requestID {
                    onCapture(meetingID, result)
                }
            } catch is CancellationError {
                // Escape, Stop, and Quit are ordinary cancellation paths.
            } catch {
                if !Task.isCancelled, self?.requestID == requestID { onFailure(error) }
            }
            guard let self, self.requestID == requestID else { return }
            self.task = nil
            self.requestID = nil
            onComplete()
            self.onChange?()
        }
        onChange?()
    }

    func cancel() {
        requestID = nil
        task?.cancel()
        task = nil
        onChange?()
    }
}
