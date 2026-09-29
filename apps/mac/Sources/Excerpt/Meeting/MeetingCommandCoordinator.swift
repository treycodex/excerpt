import Foundation

/// One command path for library, menu and shortcuts. Concurrent starts share the
/// same result, including errors. End can cancel a start suspended in permissions
/// or capture setup, and a cancelled start never hides the user's current window.
@MainActor
final class MeetingCommandCoordinator {
    private let isActive: () -> Bool
    private let startAction: (String?) async throws -> Bool
    private let stopAction: () async -> Void
    private let didStart: () -> Void
    private var startTask: Task<Void, Error>?
    private var stopping = false

    var isStarting: Bool { startTask != nil }

    init(isActive: @escaping () -> Bool,
         start: @escaping (_ title: String?) async throws -> Bool,
         stop: @escaping () async -> Void,
         didStart: @escaping () -> Void = {}) {
        self.isActive = isActive
        startAction = start
        stopAction = stop
        self.didStart = didStart
    }

    convenience init(isActive: @escaping () -> Bool,
                     start: @escaping () async throws -> Bool,
                     stop: @escaping () async -> Void,
                     didStart: @escaping () -> Void = {}) {
        self.init(isActive: isActive, start: { _ in try await start() }, stop: stop, didStart: didStart)
    }

    /// A start already under way keeps its own title; the second caller shares it.
    func start(title: String? = nil) async throws {
        if let startTask { return try await startTask.value }
        guard !stopping, !isActive() else { return }
        let task = Task { @MainActor in
            try Task.checkCancellation()
            let started = try await startAction(title)
            try Task.checkCancellation()
            if started { didStart() }
        }
        startTask = task
        defer { startTask = nil }
        try await task.value
    }

    func end() async {
        guard !stopping else { return }
        stopping = true
        defer { stopping = false }
        let pending = startTask
        pending?.cancel()
        if isActive() { await stopAction() }
        _ = try? await pending?.value
        // Also cover a dependency that finishes starting despite cancellation.
        if isActive() { await stopAction() }
    }

    func toggle() async throws {
        if isStarting || isActive() { await end() } else { try await start() }
    }
}
