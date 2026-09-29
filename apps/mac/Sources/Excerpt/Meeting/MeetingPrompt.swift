import AppKit
import SwiftUI

/// The question Excerpt asks when a call app takes or releases the microphone.
///
/// It appears without taking focus, so whatever the person is typing into the call
/// app keeps going there. Clicking the name field makes it the key window, and then
/// Return answers yes and Escape answers no. Nothing starts or ends unasked.
@MainActor
final class MeetingPromptController {
    enum Kind: Equatable {
        /// A call app began using the microphone and no meeting is being transcribed.
        case start
        /// The app the meeting is following let go of the microphone.
        case end
    }

    private var panel: NSPanel?
    private var dismiss: Task<Void, Never>?
    private let model = MeetingPromptModel()
    private(set) var kind: Kind?
    private(set) var app: MeetingApp?

    var isVisible: Bool { panel?.isVisible == true }
    /// The name as it stands in the field, for the meeting shortcut to take along.
    var title: String { model.title }

    /// `onAccept` receives the name to use, or nil for an end prompt whose suggested
    /// name was left alone — End will name it from the whole transcript instead.
    func show(_ kind: Kind, app: MeetingApp, title: String?,
              onAccept: @escaping (String?) -> Void) {
        close()
        self.kind = kind
        self.app = app
        model.reset(kind: kind, app: app, title: title ?? "")
        model.onAccept = { [weak self] in
            guard let self else { return }
            let chosen = self.model.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let keep = kind == .start || self.model.edited
            self.close()
            onAccept(keep && !chosen.isEmpty ? chosen : nil)
        }
        model.onDecline = { [weak self] in self?.close() }

        let panel = KeyablePanel(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 150),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.appearance = NSAppearance(named: .aqua)
        panel.becomesKeyOnlyIfNeeded = true
        panel.onBecomeKey = { [weak self] in self?.dismiss?.cancel() }
        panel.isReleasedWhenClosed = false
        let host = NSHostingView(rootView: MeetingPromptView(model: model))
        panel.contentView = host
        panel.setContentSize(host.fittingSize)

        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let area = screen?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - 22, y: area.maxY - panel.frame.height - 22))
        }
        panel.orderFrontRegardless()
        self.panel = panel

        // A start question nobody answered goes away on its own; an end question
        // stays, because leaving a transcript running is the costlier miss. Clicking
        // into a start question keeps it up while a name is typed.
        if kind == .start {
            dismiss = Task { [weak self] in
                try? await Task.sleep(for: .seconds(45))
                guard !Task.isCancelled else { return }
                self?.close()
            }
        }
    }

    func close() {
        dismiss?.cancel()
        dismiss = nil
        panel?.orderOut(nil)
        panel = nil
        kind = nil
        app = nil
    }
}

/// A borderless panel refuses key status by default, which would leave the name
/// field unable to take typing. Becoming key means someone clicked into it.
private final class KeyablePanel: NSPanel {
    var onBecomeKey: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override func becomeKey() {
        super.becomeKey()
        onBecomeKey?()
    }
}

@MainActor @Observable
private final class MeetingPromptModel {
    var kind: MeetingPromptController.Kind = .start
    var appName = ""
    var appIcon: NSImage?
    var title = "" { didSet { if title != original { edited = true } } }
    var edited = false
    private var original = ""
    var onAccept: () -> Void = {}
    var onDecline: () -> Void = {}

    func reset(kind: MeetingPromptController.Kind, app: MeetingApp, title: String) {
        self.kind = kind
        appName = app.name
        appIcon = app.windowOwners.lazy
            .compactMap { NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0) }
            .first.map { NSWorkspace.shared.icon(forFile: $0.path) }
        original = title
        self.title = title
        edited = false
    }
}

/// The question comes first and the call app second, so the one thing asked is the
/// thing read. It floats over someone else's app, so it says whose it is before
/// anything else — the wordmark on a credits line — and it is drawn on the notes'
/// paper, in the notes' type, so it reads as the same product as the window it leads to.
/// The name field is labelled as such: a bare field under "Start a transcript?" reads
/// as a search box, or as something that must be filled in.
private struct MeetingPromptView: View {
    @Bindable var model: MeetingPromptModel
    @FocusState private var naming: Bool

    private var isStart: Bool { model.kind == .start }
    /// The site's headline shape: grotesk, turning serif on the last word.
    private var question: Text {
        let (lead, turn) = isStart ? ("Start a ", "transcript?") : ("End this ", "meeting?")
        let grotesk = Text(lead).font(BrandFonts.sans(17, weight: 480)).tracking(-0.7)
        let serif = Text(turn).font(BrandFonts.serif(19)).tracking(-0.3)
        return Text("\(grotesk)\(serif)")
    }
    private var reason: String {
        isStart ? "\(model.appName) is using your microphone."
                : "\(model.appName) stopped using your microphone."
    }
    private var hint: String {
        isStart ? "Optional. Leave it blank and Excerpt names the meeting when it ends."
                : "Leave it as it is and Excerpt names the meeting from the whole transcript."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            credits
            Rectangle().fill(Paper.hair).frame(height: 1)
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 11) {
                    icon
                    VStack(alignment: .leading, spacing: 2) {
                        question
                        Text(reason).font(BrandFonts.sans(12)).foregroundStyle(Paper.dim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("MEETING NAME").font(BrandFonts.mono(9.5)).tracking(1.4).foregroundStyle(Paper.dim)
                    TextField("Meeting name", text: $model.title,
                              prompt: Text(isStart ? "Untitled meeting" : "Meeting name").foregroundStyle(Paper.faint))
                        .labelsHidden()
                        .textFieldStyle(.plain)
                        .font(BrandFonts.sans(13.5))
                        .focused($naming)
                        .padding(.horizontal, 11).frame(height: 34)
                        .background(Paper.lift, in: RoundedRectangle(cornerRadius: 9))
                        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(naming ? Paper.ink : Paper.line))
                        .accessibilityLabel("Meeting name")
                        .onSubmit { model.onAccept() }
                    Text(hint).font(BrandFonts.sans(11)).foregroundStyle(Paper.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Spacer()
                    Button(isStart ? "Not now" : "Keep going") { model.onDecline() }
                        .buttonStyle(ChromeButton(primary: false))
                        .keyboardShortcut(.cancelAction)
                    Button(isStart ? "Start transcript" : "End meeting") { model.onAccept() }
                        .buttonStyle(ChromeButton(primary: true))
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(16)
        }
        .frame(width: 340)
        .foregroundStyle(Paper.ink)
        .environment(\.colorScheme, .light)
        .background(Paper.ground, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Paper.edge))
    }

    /// `[ e ] EXCERPT`, then what the note is about. Motif 4: chrome is mono capitals.
    private var credits: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            // The wordmark, as the site and the app's pages set it.
            Text("\(Text("[ e ]").tracking(-1.7))  \(Text("excerpt").tracking(-0.6))")
                .font(BrandFonts.sans(13, weight: 600))
            Spacer()
            Text(isStart ? "CALL DETECTED" : "CALL ENDED").font(BrandFonts.mono(9.5)).tracking(1.4)
                .foregroundStyle(Paper.dim)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }

    /// The call app's own icon inside the site's `IconTile`: four ember corner
    /// brackets, the product's mark for the active frame.
    private var icon: some View {
        appIcon
            .padding(7)
            .overlay(CornerBrackets().stroke(Paper.ember, lineWidth: 1))
    }

    /// The call app's own icon, badged: a red dot to start, a stop square to end.
    @ViewBuilder private var appIcon: some View {
        let badge = Image(systemName: isStart ? "record.circle.fill" : "stop.circle.fill")
            .font(.system(size: 13))
            .foregroundStyle(Color.white, isStart ? Paper.live : Paper.dim)
            .background(Circle().fill(Paper.ground).padding(-1.5))
        if let appIcon = model.appIcon {
            Image(nsImage: appIcon).resizable().frame(width: 32, height: 32)
                .overlay(alignment: .bottomTrailing) { badge.offset(x: 3, y: 3) }
        } else {
            Image(systemName: isStart ? "record.circle" : "stop.circle")
                .font(.system(size: 22))
                .foregroundStyle(isStart ? Paper.live : Paper.dim)
                .frame(width: 32, height: 32)
        }
    }
}

/// Four corner brackets, `--frame-size` long: Motif 3, never a border.
private struct CornerBrackets: Shape {
    var length: CGFloat = 8

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for (corner, dx, dy) in [(CGPoint(x: rect.minX, y: rect.minY), 1.0, 1.0),
                                 (CGPoint(x: rect.maxX, y: rect.minY), -1.0, 1.0),
                                 (CGPoint(x: rect.minX, y: rect.maxY), 1.0, -1.0),
                                 (CGPoint(x: rect.maxX, y: rect.maxY), -1.0, -1.0)] {
            path.move(to: CGPoint(x: corner.x + dx * length, y: corner.y))
            path.addLine(to: corner)
            path.addLine(to: CGPoint(x: corner.x, y: corner.y + dy * length))
        }
        return path
    }
}

/// The notes' paper and ink (apps/editor/src/views/home.css), and the website's
/// paper-section hairlines, for native surfaces.
private enum Paper {
    static let ground = Color(red: 0xf4 / 255, green: 0xf3 / 255, blue: 0xe6 / 255)
    static let lift = Color(red: 0xfb / 255, green: 0xfa / 255, blue: 0xf1 / 255)
    static let ink = Color(red: 0x1d / 255, green: 0x20 / 255, blue: 0x1a / 255)
    static let dim = Color(red: 0x58 / 255, green: 0x5c / 255, blue: 0x4e / 255)
    static let faint = Color(red: 0x8d / 255, green: 0x90 / 255, blue: 0x7f / 255)
    static let line = Color(red: 0xde / 255, green: 0xdc / 255, blue: 0xc5 / 255)
    static let hair = Color(red: 0xe4 / 255, green: 0xe2 / 255, blue: 0xcd / 255)
    static let edge = Color(red: 0xc9 / 255, green: 0xcb / 255, blue: 0xb4 / 255)
    /// The one accent: the active frame.
    static let ember = Color(red: 0xff / 255, green: 0x4d / 255, blue: 0x0f / 255)
    /// Home's live dot. Listening, not the ember: ember means settled.
    static let live = Color(red: 0xd8 / 255, green: 0x40 / 255, blue: 0x1a / 255)
}

/// The site's buttons on paper: ink solid for the answer, a hairline for the other.
private struct ChromeButton: ButtonStyle {
    var primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(BrandFonts.sans(12.5, weight: 500))
            .padding(.horizontal, 14).frame(height: 32)
            .foregroundStyle(primary ? Paper.ground : Paper.ink)
            .background(primary ? Paper.ink : Paper.lift, in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(primary ? Paper.ink : Paper.line))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .contentShape(Rectangle())
    }
}
