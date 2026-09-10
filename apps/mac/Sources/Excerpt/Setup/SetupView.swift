import SwiftUI

private typealias Palette = CaptionTokens.Palette

/// The guided setup. Four steps, in the order a person experiences the product:
/// see it, let it listen, get ready, done.
struct SetupView: View {
    @Bindable var model: SetupModel
    var onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            strip
            Divider().overlay(Palette.line)

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    switch model.step {
                    case .preview: preview
                    case .permissions: permissions
                    case .model: speechModel
                    case .ready: ready
                    }
                }
                .padding(40)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Divider().overlay(Palette.line)
            footer
        }
        .background(Palette.ground)
        .preferredColorScheme(.dark)
        .task { await model.refreshPermissions() }
    }

    // MARK: - Motif 2, The Strip

    /// Four ticks. Ember means settled, here as everywhere.
    private var strip: some View {
        HStack(spacing: 0) {
            ForEach(SetupModel.Step.allCases) { step in
                VStack(alignment: .leading, spacing: 8) {
                    Rectangle()
                        .fill(step.rawValue <= model.step.rawValue ? Palette.ember : Palette.line)
                        .frame(height: 2)
                    Text(step.title.uppercased())
                        .font(.system(size: 10, design: .monospaced))
                        .tracking(1.6)
                        .foregroundStyle(step == model.step ? Palette.ink : Palette.faint)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 12)
            }
        }
        .padding(.horizontal, 40)
        .padding(.top, 34)
        .padding(.bottom, 18)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: model.step)
    }

    private func heading(_ eyebrow: String, _ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(eyebrow.uppercased())
                .font(.system(size: 10, design: .monospaced))
                .tracking(3)
                .foregroundStyle(Palette.faint)
            Text(title)
                .font(.system(size: 34, weight: .regular, design: .serif))
                .foregroundStyle(Palette.ink)
                // Apple's rule: tracking is size-specific. Large text reads too loose.
                .tracking(-0.6)
            Text(body)
                .font(.system(size: 14))
                .foregroundStyle(Palette.dim)
                .lineSpacing(5)
                .frame(maxWidth: 520, alignment: .leading)
        }
    }

    // MARK: - 1 · See it

    private var preview: some View {
        VStack(alignment: .leading, spacing: 26) {
            heading(
                "What Excerpt does",
                "Subtitles over your meeting.",
                "Excerpt listens to a call and puts the words on screen as they are said — over the meeting, not in a window beside it. Afterwards it writes down what was decided and what you agreed to do.\n\nPick how the subtitles should look. You can change this any time from the menu bar."
            )

            HStack(spacing: 10) {
                ForEach(CaptionPreset.allCases) { preset in
                    Button {
                        model.overlay.setPreset(preset)
                        showPreview()
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(preset.title)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Palette.ink)
                            Text(preset.explanation)
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.dim)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(Palette.raise)
                        .overlay(
                            Rectangle().strokeBorder(
                                model.overlay.preset == preset ? Palette.ember : Palette.line,
                                lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }

            Button("Show me on screen") { showPreview() }
                .buttonStyle(SecondaryButton())

            Text("A sample subtitle appears over whatever is on screen. It ignores your clicks — you can keep working while it is there.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.faint)
        }
    }

    /// The preview is the real overlay with real text in it, not a picture of one.
    /// Choosing a look against a mock is choosing it against the wrong thing.
    private func showPreview() {
        model.overlay.show()
        model.overlay.update(
            speaker: "SPEAKER",
            text: "Okay. Let's move the campaign launch to October. That's decided."
        )
    }

    // MARK: - 2 · Let it listen

    private var permissions: some View {
        VStack(alignment: .leading, spacing: 26) {
            heading(
                "Three permissions",
                "macOS asks before an app can listen.",
                "Excerpt needs all three, and macOS treats them separately. Nothing is uploaded and nothing is saved but the words themselves — the folder they go in is one click away in the menu bar."
            )

            VStack(spacing: 0) {
                ForEach(Permission.allCases, id: \.self) { permission in
                    permissionRow(permission)
                    if permission != Permission.allCases.last {
                        Divider().overlay(Palette.line)
                    }
                }
            }
            .background(Palette.raise)

            if model.needsRelaunch {
                Callout(
                    tone: .warn,
                    title: "Quit and open Excerpt again",
                    message: "macOS only applies screen recording after the app restarts. Allow it in System Settings, then reopen Excerpt and carry on from here."
                )
            }
        }
    }

    private func permissionRow(_ permission: Permission) -> some View {
        let state = model.permissions[permission] ?? .unknown

        return HStack(alignment: .top, spacing: 16) {
            Image(systemName: symbol(for: permission))
                .font(.system(size: 15))
                .foregroundStyle(state == .granted ? Palette.ember : Palette.faint)
                .frame(width: 22, alignment: .center)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 5) {
                Text(permission.rawValue)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.ink)
                Text(state == .denied ? model.consequence(of: permission) : model.purpose(of: permission))
                    .font(.system(size: 12))
                    .foregroundStyle(state == .denied ? Palette.warn : Palette.dim)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 12)

            switch state {
            case .granted:
                Text("ON")
                    .font(.system(size: 10, design: .monospaced))
                    .tracking(1.6)
                    .foregroundStyle(Palette.ember)
            case .denied:
                Button("Open Settings") { openSettings(for: permission) }
                    .buttonStyle(SecondaryButton())
            case .undetermined, .unknown:
                Button("Allow") { Task { await model.request(permission) } }
                    .buttonStyle(PrimaryButton())
            }
        }
        .padding(16)
    }

    private func symbol(for permission: Permission) -> String {
        switch permission {
        case .microphone: "mic"
        case .screenRecording: "rectangle.on.rectangle"
        case .speech: "waveform"
        }
    }

    /// Once denied, macOS will not ask again — the only way back is System Settings,
    /// so the button goes there rather than pretending another prompt will appear.
    private func openSettings(for permission: Permission) {
        let pane = switch permission {
        case .microphone: "Privacy_Microphone"
        case .screenRecording: "Privacy_ScreenCapture"
        case .speech: "Privacy_SpeechRecognition"
        }
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(pane)") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - 3 · Get ready

    private var speechModel: some View {
        VStack(alignment: .leading, spacing: 26) {
            // The heading says what is happening, not what usually happens. Most Macs
            // already have the model, and telling those people it is downloading is a
            // small lie that makes everything else here less believable.
            heading("The words stay here", modelTitle,
                "Excerpt writes speech down on this Mac, which means the model that does it has to be on this Mac. It downloads once, from Apple, and after that Excerpt works with no connection at all."
            )

            switch model.modelState {
            case .unknown, .checking:
                Row(symbol: "arrow.down.circle", tint: Palette.dim, text: "Checking what this Mac already has…")
            case .downloading(let fraction):
                VStack(alignment: .leading, spacing: 10) {
                    Row(symbol: "arrow.down.circle", tint: Palette.dim,
                        text: "Downloading — \(Int(fraction * 100))%")
                    ProgressView(value: fraction)
                        .tint(Palette.ember)
                        .frame(maxWidth: 380)
                }
            case .ready:
                Row(symbol: "checkmark.circle", tint: Palette.ember, text: "Ready. Nothing will leave this Mac.")
            case .failed(let message):
                VStack(alignment: .leading, spacing: 14) {
                    Callout(
                        tone: .bad,
                        title: "The speech model could not be installed",
                        message: "Excerpt cannot write anything down without it. Check your connection and try again — the download comes from Apple, not from us.\n\n\(message)"
                    )
                    Button("Try again") { Task { await model.provisionModel() } }
                        .buttonStyle(PrimaryButton())
                }
            }
        }
    }

    private var modelTitle: String {
        switch model.modelState {
        case .unknown, .checking: "Checking the speech model."
        case .downloading: "Downloading the speech model."
        case .ready: "The speech model is here."
        case .failed: "The speech model is missing."
        }
    }

    // MARK: - 4 · Done

    private var ready: some View {
        VStack(alignment: .leading, spacing: 26) {
            heading(
                "Set up",
                "Excerpt lives in your menu bar.",
                "There is no Dock icon and no window to keep open. Everything happens from the small caption icon at the top of the screen."
            )

            VStack(alignment: .leading, spacing: 14) {
                Row(symbol: "record.circle", tint: Palette.ember,
                    text: "Start listening — ⌘⇧R, or from the menu")
                Row(symbol: "captions.bubble", tint: Palette.dim,
                    text: "Show captions over my meeting — ⌘⇧C")
                Row(symbol: "doc.text", tint: Palette.dim,
                    text: "Open notes — ⌘N. They open by themselves when a meeting ends.")
                Row(symbol: "folder", tint: Palette.dim,
                    text: "Show where notes are kept — they are files on this Mac, and you can go and look")
            }

            Text("Wear headphones if you can. Otherwise your microphone hears the meeting through the speakers, and Excerpt has to work out which words you actually said.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.faint)
                .frame(maxWidth: 520, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            if model.step != .preview && model.step != .ready {
                Button("Back") { model.back() }
                    .buttonStyle(SecondaryButton())
            }

            Spacer()

            if model.step != .ready {
                Button("Not now") {
                    model.dismissForNow()
                    onFinish()
                }
                .buttonStyle(QuietButton())
            }

            Button(nextTitle) {
                if model.step == .ready { onFinish() } else { Task { await model.advance() } }
            }
            .buttonStyle(PrimaryButton())
            .disabled(model.step == .permissions && !model.canLeavePermissions)
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 20)
    }

    private var nextTitle: String {
        switch model.step {
        case .preview: "Continue"
        case .permissions: model.canLeavePermissions ? "Continue" : "Waiting for all three"
        case .model: model.modelState == .ready ? "Continue" : "Skip for now"
        case .ready: "Start using Excerpt"
        }
    }
}

// MARK: - Pieces

private struct Row: View {
    let symbol: String
    let tint: Color
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 13))
                .foregroundStyle(tint)
                .frame(width: 18, alignment: .center)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct Callout: View {
    enum Tone { case warn, bad }
    let tone: Tone
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(tone == .bad ? Palette.bad : Palette.warn)
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(Palette.dim)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: 520, alignment: .leading)
        .background(Palette.raise)
        .overlay(Rectangle().strokeBorder(tone == .bad ? Palette.bad.opacity(0.4) : Palette.warn.opacity(0.35), lineWidth: 1))
    }
}

/// Press feedback lands on pointer-down, at the same duration and scale the web uses.
/// A button that waits for the release to react feels dead.
private struct PressFeedback: ViewModifier {
    let pressed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && !reduceMotion ? 0.97 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: pressed)
    }
}

private struct PrimaryButton: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, design: .monospaced))
            .tracking(1.4)
            .textCase(.uppercase)
            .foregroundStyle(isEnabled ? Palette.ground : Palette.faint)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(isEnabled ? Palette.ink : Palette.line)
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}

private struct SecondaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, design: .monospaced))
            .tracking(1.4)
            .textCase(.uppercase)
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .overlay(Rectangle().strokeBorder(Palette.lineStrong, lineWidth: 1))
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}

private struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, design: .monospaced))
            .tracking(1.4)
            .textCase(.uppercase)
            .foregroundStyle(Palette.faint)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}
