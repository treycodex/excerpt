import Foundation

/// The single command path used by the library bridge, menu, and global shortcuts.
/// It coalesces equivalent requests while a transition is underway and keeps window
/// focus policy out of the capture lifecycle itself.
@MainActor
final class MeetingCommandCoordinator {
    private let isActive: () -> Bool
    private let startAction: () async throws -> Bool
    private let stopAction: () async -> Void
    private let didStart: () -> Void
    private var transitioning = false

    init(isActive: @escaping () -> Bool,
         start: @escaping () async throws -> Bool,
         stop: @escaping () async -> Void,
         didStart: @escaping () -> Void = {}) {
        self.isActive = isActive
        startAction = start
        stopAction = stop
        self.didStart = didStart
    }

    func start() async throws {
        guard !transitioning, !isActive() else { return }
        transitioning = true
        defer { transitioning = false }
        if try await startAction() { didStart() }
    }

    func end() async {
        guard !transitioning, isActive() else { return }
        transitioning = true
        defer { transitioning = false }
        await stopAction()
    }

    func toggle() async throws {
        if isActive() { await end() } else { try await start() }
    }
}
