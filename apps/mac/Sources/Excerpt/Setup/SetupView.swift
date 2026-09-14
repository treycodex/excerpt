import SwiftUI

private enum Palette {
    static let ground = Color(red: 0.039, green: 0.043, blue: 0.035)
    static let raise = Color(red: 0.075, green: 0.082, blue: 0.067)
    static let ink = Color(red: 0.945, green: 0.941, blue: 0.867)
    static let dim = Color(red: 0.675, green: 0.678, blue: 0.635)
    static let faint = Color(red: 0.47, green: 0.48, blue: 0.43)
    static let line = Color(red: 0.224, green: 0.231, blue: 0.196)
    static let lineStrong = Color(red: 0.40, green: 0.43, blue: 0.35)
    static let ember = Color(red: 0.45, green: 0.53, blue: 0.35)
    static let warn = Color(red: 0.90, green: 0.72, blue: 0.37)
    static let bad = Color(red: 0.98, green: 0.40, blue: 0.32)
}

/// The guided setup. Four steps, in the order a person experiences the product:
/// see it, let it listen, get ready, done.
struct SetupView: View {
    @Bindable var model: SetupModel
    var onFinish: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        switch model.step {
                        case .preview: preview
                        case .permissions: permissions
                        case .model: speechModel
                        case .ready: ready
                        }
                    }
                    .padding(36)
                    .padding(.top, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Divider().overlay(Palette.line)
                footer
            }
        }
        .background(Palette.ground)
        .preferredColorScheme(.dark)
        .task { await model.refreshPermissions() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.refreshPermissions() }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("[ e ]")
                .font(.system(size: 28, weight: .medium))
                .tracking(-3)
                .foregroundStyle(Palette.ink)
                .padding(.bottom, 12)
            Text("EXCERPT")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .tracking(2.5)
                .foregroundStyle(Palette.ink)
                .padding(.bottom, 10)
            Text("The work, the numbers,\nthe conversation.")
                .font(.system(size: 13))
                .lineSpacing(4)
                .foregroundStyle(Palette.dim)
                .padding(.bottom, 48)
            ForEach(SetupModel.Step.allCases) { step in
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(step == model.step ? Palette.ink : Palette.line.opacity(0.65))
                        if step.rawValue < model.step.rawValue {
                            Image(systemName: "checkmark").font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Palette.ground)
                        } else {
                            Text("\(step.rawValue + 1)").font(.system(size: 12, weight: .medium))
                                .foregroundStyle(step == model.step ? Palette.ground : Palette.dim)
                        }
                    }.frame(width: 26, height: 26)
                    Text(step.title).font(.system(size: 13, weight: step == model.step ? .semibold : .regular))
                        .foregroundStyle(step == model.step ? Palette.ink : Palette.dim)
                }
                .padding(.vertical, 12)
                .accessibilityLabel("Step \(step.rawValue + 1), \(step.title)\(step == model.step ? ", current step" : "")")
            }
            Spacer()
            Image(systemName: "lock.shield").font(.system(size: 18)).foregroundStyle(Palette.ember)
                .padding(.bottom, 12)
            Text("On your Mac.\nUnder your control.").font(.system(size: 13)).lineSpacing(4).foregroundStyle(Palette.dim)
            Text("FREE · OPEN SOURCE").font(.system(size: 9, design: .monospaced)).tracking(1.3)
                .foregroundStyle(Palette.faint).padding(.top, 24)
        }
        .padding(.horizontal, 26).padding(.top, 54).padding(.bottom, 30)
        .frame(width: 226, alignment: .leading)
        .frame(maxHeight: .infinity)
        .background(Palette.raise)
    }

    private func heading(_ eyebrow: String, _ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(eyebrow.uppercased())
                .font(.system(size: 10, design: .monospaced))
                .tracking(3)
                .foregroundStyle(Palette.faint)
            Text(title)
                .font(.system(size: 38, weight: .regular, design: .serif))
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
                "WELCOME TO EXCERPT",
                "Remember the screen, and the conversation.",
                "Capture the report or creative on screen, keep the discussion beside it, and read editable notes afterwards. Subtitles follow the conversation while you watch the work — choose how they look to get started."
            )

            subtitlePreview
            HStack(spacing: 10) {
                ForEach(CaptionPreset.allCases) { preset in
                    Button { model.overlay.setPreset(preset) } label: {
                        HStack(spacing: 6) {
                            Text(preset.title).font(.system(size: 12, weight: .medium))
                            if model.overlay.preset == preset { Image(systemName: "checkmark").font(.system(size: 10, weight: .semibold)) }
                        }
                        .foregroundStyle(model.overlay.preset == preset ? Palette.ember : Palette.dim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(model.overlay.preset == preset ? Palette.raise : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(model.overlay.preset == preset ? Palette.ember.opacity(0.5) : Palette.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.overlay.preset == preset ? .isSelected : [])
                    .help(preset.explanation)
                }
            }

            Button("Preview on my screen") { showPreview() }
                .buttonStyle(SecondaryButton())

            Text("You can change this later from the Excerpt menu.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.faint)
        }
    }

    private var subtitlePreview: some View {
        let style = CaptionStyle.resolve(preset: model.overlay.preset, size: .medium, position: .standard,
                                         screenWidth: 1000, increaseContrast: false, reduceMotion: true)
        return ZStack(alignment: .bottom) {
            if let url = Bundle.main.resourceURL?.appendingPathComponent("notes/media/editorial-hero.jpg"),
               let image = NSImage(contentsOf: url) {
                Image(nsImage: image).resizable().scaledToFill()
            } else { Color(red: 0.16, green: 0.23, blue: 0.21) }
            LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .center, endPoint: .bottom)
            VStack(spacing: 9) {
                Text("Let’s make it happen.")
                    .font(Font(style.font)).foregroundStyle(style.preset.color)
                    .shadow(color: .black.opacity(0.8), radius: 2, y: 1)
                    .padding(style.preset.padding).background(style.preset.backdrop)
                Text("SUBTITLE PREVIEW").font(.system(size: 8, design: .monospaced)).tracking(2).foregroundStyle(.white.opacity(0.65))
            }.padding(.bottom, 22)
        }
        .frame(height: 205).frame(maxWidth: .infinity)
        .clipped().clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityLabel("\(model.overlay.preset.title) subtitle preview: Let’s make it happen.")
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
                "Let Excerpt hear your meeting.",
                "Allow these three permissions to capture both sides of your call and transcribe on your Mac. Excerpt saves text, not audio or video."
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
            .clipShape(RoundedRectangle(cornerRadius: 10))

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
                Label("Allowed", systemImage: "checkmark.circle.fill")
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
                "Excerpt uses Apple’s on-device speech model. If it isn’t installed yet, we’ll download it once. Your meeting audio stays on your Mac."
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
        case .ready: "Ready to transcribe on your Mac."
        case .failed: "The speech model is missing."
        }
    }

    // MARK: - 4 · Done

    private var ready: some View {
        VStack(alignment: .leading, spacing: 26) {
            heading(
                "YOU’RE READY",
                "Your next meeting, in notes.",
                "Look for the caption icon in your menu bar. Start listening when your meeting begins, then stop to open your notes."
            )

            VStack(alignment: .leading, spacing: 14) {
                Row(symbol: "record.circle", tint: Palette.ember,
                    text: "Start listening — ⌘⇧R, or from the menu")
                Row(symbol: "captions.bubble", tint: Palette.dim,
                    text: "Show captions over my meeting — ⌘⇧C")
                Row(symbol: "doc.text", tint: Palette.dim,
                    text: "Open notes — ⌘N. They open by themselves when a meeting ends.")
                Row(symbol: "folder", tint: Palette.dim,
                    text: "Find your saved notes in the Excerpt folder")
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
            .disabled((model.step == .permissions && !model.canLeavePermissions) || (model.step == .model && model.modelState != .ready))
        }
        .padding(.horizontal, 40)
        .padding(.vertical, 20)
    }

    private var nextTitle: String {
        switch model.step {
        case .preview: "Continue"
        case .permissions: model.canLeavePermissions ? "Continue" : "Waiting for all three"
        case .model: model.modelState == .ready ? "Continue" : "Getting ready…"
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
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isEnabled ? Color.white : Palette.faint)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(isEnabled ? Palette.ember : Palette.line)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}

private struct SecondaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Palette.lineStrong, lineWidth: 1))
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}

private struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Palette.faint)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .modifier(PressFeedback(pressed: configuration.isPressed))
    }
}
