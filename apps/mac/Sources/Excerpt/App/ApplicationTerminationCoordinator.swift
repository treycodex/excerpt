import Foundation

/// Converts AppKit's synchronous termination question into one asynchronous cleanup.
/// Repeated quit requests share the same work and receive one completion reply.
@MainActor
final class ApplicationTerminationCoordinator {
    enum Decision { case terminateNow, terminateLater }
    private var task: Task<Void, Never>?

    func request(
        requiresCleanup: Bool,
        cancelPendingUI: () -> Void,
        cleanup: @escaping @MainActor () async -> Void,
        reply: @escaping @MainActor (Bool) -> Void
    ) -> Decision {
        cancelPendingUI()
        guard task == nil else { return .terminateLater }
        guard requiresCleanup else { return .terminateNow }
        task = Task { [weak self] in
            await cleanup()
            reply(true)
            self?.task = nil
        }
        return .terminateLater
    }

    var isPending: Bool { task != nil }
}
