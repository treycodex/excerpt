import Foundation
import Observation

/// The guided setup, as state rather than as screens.
///
/// The order is the journey, not the dependency graph: you see what Excerpt does
/// before you are asked to allow anything. Asking for the microphone first is how a
/// privacy-first app gets refused by someone who has not yet been told what it is for.
///
/// Every decision lives here, so what the flow does can be checked without a window
/// on screen — including the parts that only happen when something goes wrong.
@MainActor
@Observable
final class SetupModel {

    enum Step: Int, CaseIterable, Identifiable {
        case preview, permissions, model, ready

        var id: Int { rawValue }

        /// Named for what the person does, not for what the app configures.
        var title: String {
            switch self {
            case .preview: "Your style"
            case .permissions: "Permissions"
            case .model: "Speech model"
            case .ready: "Ready to meet"
            }
        }
    }

    enum ModelState: Equatable {
        case unknown
        case checking
        case downloading(Double)
        case ready
        case failed(String)
    }

    private(set) var step: Step = .preview
    private(set) var permissions: [Permission: Permission.State] = [:]
    private(set) var modelState: ModelState = .unknown

    /// macOS applies a screen-recording grant only after the app restarts — measured
    /// in Stage 0, and an app that does not say so looks broken to someone who has
    /// just ticked the box.
    private(set) var needsRelaunch = false

    /// Set when the user has been all the way through. Not "has permissions": someone
    /// who declined and quit should not be asked again every launch.
    var hasCompletedSetup: Bool {
        get { defaults.bool(forKey: Self.completedKey) }
        set { defaults.set(newValue, forKey: Self.completedKey) }
    }

    private static let completedKey = "setup.completed"
    private let defaults: UserDefaults
    let overlay: OverlayController

    /// Reading a permission and installing a model are the two things this flow does
    /// that reach outside the process. They come in as functions so the decisions
    /// around them — what unlocks Continue, when a relaunch is really needed, what a
    /// failure says — can be checked without a TCC prompt or a download.
    private let readPermission: @Sendable (Permission) async -> Permission.State
    private let requestPermission: @Sendable (Permission) async -> Permission.State
    private let installModel: @Sendable (@escaping @Sendable (Double) -> Void) async -> ModelState

    init(
        overlay: OverlayController,
        defaults: UserDefaults = .standard,
        readPermission: @escaping @Sendable (Permission) async -> Permission.State = { await Permissions.state(of: $0) },
        requestPermission: @escaping @Sendable (Permission) async -> Permission.State = { await Permissions.request($0) },
        installModel: @escaping @Sendable (@escaping @Sendable (Double) -> Void) async -> ModelState = SetupModel.installSpeechModel
    ) {
        self.overlay = overlay
        self.defaults = defaults
        self.readPermission = readPermission
        self.requestPermission = requestPermission
        self.installModel = installModel
    }

    private static let installSpeechModel: @Sendable (@escaping @Sendable (Double) -> Void) async -> ModelState = { onProgress in
        let report = await ModelProvisioning.install(onProgress: onProgress)
        if let error = report.error { return .failed(error) }
        if report.passes || report.localeInstalled { return .ready }
        return .failed("The speech model is not installed and could not be downloaded.")
    }

    // MARK: - Where things stand

    var everythingGranted: Bool {
        Permission.allCases.allSatisfy { permissions[$0] == .granted }
    }

    var canLeavePermissions: Bool { everythingGranted }

    /// What is missing, said as a consequence rather than as a status. Someone who has
    /// declined needs to know what they have lost, not that a flag is false.
    func consequence(of permission: Permission) -> String {
        switch permission {
        case .microphone:
            "Excerpt can hear everyone else, but not you — so nothing will ever be marked as yours."
        case .screenRecording:
            "This is how macOS lets an app hear a meeting's audio. Without it Excerpt hears nothing at all."
        case .speech:
            "Excerpt turns speech into text on this Mac. macOS asks permission even though nothing is uploaded."
        }
    }

    /// Why it is being asked for, before it is asked for. Shown whatever the state.
    func purpose(of permission: Permission) -> String {
        switch permission {
        case .microphone: "So Excerpt can tell what you said from what everyone else said."
        case .screenRecording: "So Excerpt can hear the meeting. Nothing about your screen is recorded."
        case .speech: "So the words can be written down here, on this Mac."
        }
    }

    // MARK: - Actions

    func refreshPermissions() async {
        for permission in Permission.allCases {
            permissions[permission] = await readPermission(permission)
        }
    }

    func request(_ permission: Permission) async {
        let before = permissions[permission]
        let after = await requestPermission(permission)
        permissions[permission] = after

        // Screen recording is the one that cannot take effect now. Only say so when a
        // grant was actually being asked for — repeating it at every refresh turns a
        // real instruction into noise.
        if permission == .screenRecording, before != .granted, after != .granted {
            needsRelaunch = true
        }
    }

    func provisionModel() async {
        provisioning += 1
        let attempt = provisioning
        modelState = .checking

        let result = await installModel { [weak self] fraction in
            Task { @MainActor in
                // Progress arrives on its own schedule and can land after the install
                // has already finished. A completed fraction is not readiness anyway —
                // the locale still has to be reserved.
                guard let self, self.provisioning == attempt, fraction < 1 else { return }
                self.modelState = .downloading(fraction)
            }
        }

        guard provisioning == attempt else { return }   // a newer attempt owns the state
        modelState = result
    }

    /// Distinguishes one attempt from the next, so a late progress callback from an
    /// abandoned one cannot move the flow backwards.
    private var provisioning = 0

    // MARK: - Movement

    func advance() async {
        switch step {
        case .preview:
            step = .permissions
            await refreshPermissions()
        case .permissions:
            guard canLeavePermissions else { return }
            step = .model
            await provisionModel()
        case .model:
            guard modelState == .ready else { return }
            step = .ready
            hasCompletedSetup = true
        case .ready:
            break
        }
    }

    /// Opens the flow at one step, for looking at a step without clicking through to
    /// it. The permission and model steps do their own work on arrival, exactly as
    /// they would if you had walked there.
    func jump(to step: Step) async {
        self.step = step
        switch step {
        case .permissions: await refreshPermissions()
        case .model: await provisionModel()
        case .preview, .ready: break
        }
    }

    func back() {
        guard let previous = Step(rawValue: step.rawValue - 1) else { return }
        step = previous
    }

    /// Leaving early is allowed and remembered. Someone who does not want to grant
    /// anything today should not be handed this window again tomorrow.
    func dismissForNow() {
        hasCompletedSetup = true
    }
}
