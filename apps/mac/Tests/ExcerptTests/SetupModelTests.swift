import Foundation
import Testing
@testable import Excerpt

/// The setup flow's decisions, without a TCC prompt or a download.
@MainActor
struct SetupModelTests {

    private func makeModel(
        granted: Set<Permission> = [],
        requestResult: Permission.State = .granted,
        model install: @escaping @Sendable (@escaping @Sendable (Double) -> Void) async -> SetupModel.ModelState = { _ in .ready }
    ) -> SetupModel {
        let defaults = UserDefaults(suiteName: "excerpt-tests-\(UUID().uuidString)")!
        return SetupModel(
            overlay: OverlayController(defaults: defaults),
            microphone: MicrophoneController(defaults: defaults, discovery: EmptyMicrophoneDiscovery()),
            defaults: defaults,
            readPermission: { granted.contains($0) ? .granted : .undetermined },
            requestPermission: { _ in requestResult },
            installModel: install
        )
    }

    @Test func `the flow starts by showing what the product does, not by asking for anything`() {
        #expect(makeModel().step == .preview)
    }

    @Test func `Continue stays shut until all three are granted`() async {
        let model = makeModel(granted: [.microphone, .speech])
        await model.refreshPermissions()
        #expect(!model.canLeavePermissions)

        let all = makeModel(granted: Set(Permission.allCases))
        await all.refreshPermissions()
        #expect(all.canLeavePermissions)
    }

    @Test func `a denied permission is described by what it costs, not by its status`() {
        let model = makeModel()
        for permission in Permission.allCases {
            // No jargon, and no sentence that only makes sense if you know what TCC is.
            #expect(!model.consequence(of: permission).isEmpty)
            #expect(!model.purpose(of: permission).isEmpty)
            #expect(!model.consequence(of: permission).contains("TCC"))
        }
    }

    @Test func `screen recording asks for a relaunch only when it is still not granted`() async {
        // Measured in Stage 0: macOS applies this one only after the app restarts.
        let refused = makeModel(requestResult: .denied)
        await refused.request(.screenRecording)
        #expect(refused.needsRelaunch)

        let allowed = makeModel(requestResult: .granted)
        await allowed.request(.screenRecording)
        #expect(!allowed.needsRelaunch)
    }

    @Test func `the other two never ask for a relaunch`() async {
        let model = makeModel(requestResult: .denied)
        await model.request(.microphone)
        await model.request(.speech)
        #expect(!model.needsRelaunch)
    }

    @Test func `a model failure keeps the reason it failed`() async {
        let model = makeModel(model: { _ in .failed("no network") })
        await model.provisionModel()
        #expect(model.modelState == .failed("no network"))
    }

    @Test func `progress moves the state and finishing settles it`() async {
        let model = makeModel(model: { progress in
            progress(0.4)
            try? await Task.sleep(for: .milliseconds(20))
            return .ready
        })
        await model.provisionModel()
        // A completed download is not the same as a ready model, and the last word
        // belongs to the install rather than to the progress meter.
        #expect(model.modelState == .ready)
    }

    @Test func `walking to the end marks the setup done`() async {
        let model = makeModel(granted: Set(Permission.allCases))
        #expect(!model.hasCompletedSetup)

        await model.advance()   // preview  -> permissions
        await model.advance()   // permissions -> model
        await model.advance()   // model -> input
        #expect(model.step == .input)
        await model.advance()   // input -> ready
        #expect(model.step == .ready)
        #expect(model.hasCompletedSetup)
    }

    @Test func `declining is remembered, so it is not asked again tomorrow`() async {
        let model = makeModel()
        await model.dismissForNow()
        #expect(model.hasCompletedSetup)
    }

    @Test func `incomplete setup cannot be marked ready`() async {
        let missingPermissions = makeModel()
        await missingPermissions.advance()
        await missingPermissions.advance()
        #expect(missingPermissions.step == .permissions)
        #expect(!missingPermissions.hasCompletedSetup)

        let missingModel = makeModel(granted: Set(Permission.allCases), model: { _ in .failed("offline") })
        await missingModel.advance()
        await missingModel.advance()
        await missingModel.advance()
        #expect(missingModel.step == .model)
        #expect(!missingModel.hasCompletedSetup)
    }

    @Test func `Back never falls off the front`() async {
        let model = makeModel()
        await model.back()
        #expect(model.step == .preview)
    }
}

private struct EmptyMicrophoneDiscovery: MicrophoneDiscovering {
    func devices() -> [MicrophoneDevice] { [] }
    func defaultDeviceID() -> String? { nil }
}
