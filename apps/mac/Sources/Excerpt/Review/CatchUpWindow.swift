import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct CatchUpTurn: Identifiable, Equatable {
    var id: String
    var role: SourceRole
    var speaker: String
    var events: [TranscriptEvent]

    static func group(_ events: [TranscriptEvent]) -> [CatchUpTurn] {
        var turns: [CatchUpTurn] = []
        for event in events {
            if let previous = turns.last, previous.role == event.role, previous.speaker == event.speakerLabel {
                turns[turns.count - 1].events.append(event)
            } else {
                turns.append(CatchUpTurn(id: event.id, role: event.role, speaker: event.speakerLabel, events: [event]))
            }
        }
        return turns
    }

    static func time(_ event: TranscriptEvent) -> Double { event.tStart.map { $0 * 1000 } ?? event.tArrived }
    static func target(in events: [TranscriptEvent], now: Double, seconds: Int) -> String? {
        events.first(where: { time($0) >= max(0, now - Double(seconds) * 1000) })?.id ?? events.last?.id
    }
}

@MainActor @Observable
private final class CatchUpContent {
    var events: [TranscriptEvent] = []
    var now: Double = 0
    var revision = 0
    var notice = ""
}

@MainActor
final class CatchUpWindowController: NSObject, NSWindowDelegate {
    private var panel: NSPanel?
    private let content = CatchUpContent()
    private var updates: Task<Void, Never>?
    private var noticeTimer: Task<Void, Never>?
    private var onReturn: (() -> Void)?
    var isVisible: Bool { panel?.isVisible == true }

    func show(events: [TranscriptEvent], now: Double,
              source: @escaping () -> (events: [TranscriptEvent], now: Double),
              onReturn: @escaping () -> Void, onImages: @escaping ([NSItemProvider]) -> Void) {
        close()
        self.onReturn = onReturn
        content.events = events; content.now = now; content.notice = ""; content.revision = 0
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 460, height: 440),
                            styleMask: [.titled, .closable, .resizable, .fullSizeContentView, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Catch up"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.backgroundColor = NSColor(red: 0.125, green: 0.13, blue: 0.118, alpha: 1)
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] { panel.standardWindowButton(button)?.isHidden = true }
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.minSize = NSSize(width: 340, height: 300)
        panel.delegate = self
        panel.contentView = NSHostingView(rootView: CatchUpView(content: content, onReturn: { [weak self] in self?.returnToLive() }, onImages: onImages))
        let restored = panel.setFrameUsingName("ExcerptCatchUp")
        panel.setFrameAutosaveName("ExcerptCatchUp")
        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let screen {
            let area = screen.visibleFrame
            if !restored { panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - 24, y: area.minY + 90)) }
            // An unplugged display must not leave the remembered panel offscreen.
            if !NSScreen.screens.contains(where: { $0.visibleFrame.intersection(panel.frame).width >= 150 && $0.visibleFrame.intersection(panel.frame).height >= 100 }) {
                panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - 24, y: area.minY + 90))
            }
        }
        panel.makeKeyAndOrderFront(nil)
        self.panel = panel
        updates = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled, let self, self.isVisible else { return }
                let next = source()
                if self.content.events != next.events { self.content.events = next.events; self.content.revision += 1 }
                self.content.now = next.now
            }
        }
    }

    func showNotice(_ text: String) {
        guard isVisible else { return }
        content.notice = text
        noticeTimer?.cancel()
        noticeTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            self?.content.notice = ""
        }
    }

    private func returnToLive() { let action = onReturn; close(); action?() }
    func windowShouldClose(_ sender: NSWindow) -> Bool { returnToLive(); return false }
    func close() {
        updates?.cancel(); updates = nil
        noticeTimer?.cancel(); noticeTimer = nil
        panel?.saveFrame(usingName: "ExcerptCatchUp")
        panel?.orderOut(nil); panel = nil; onReturn = nil
    }
}

private struct CatchUpView: View {
    let content: CatchUpContent
    let onReturn: () -> Void
    let onImages: ([NSItemProvider]) -> Void
    @State private var seconds = 60
    @State private var seen = 0
    @State private var atBottom = true
    @State private var draggingImage = false
    private let ground = Color(red: 0.125, green: 0.13, blue: 0.118)
    private let muted = Color(red: 0.66, green: 0.67, blue: 0.63)
    private let ink = Color(red: 0.95, green: 0.945, blue: 0.91)
    private func stamp(_ value: Double) -> String { String(format: "%d:%02d", Int(value / 60000), Int(value / 1000) % 60) }

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text("[ e ]").font(.system(size: 12, design: .monospaced)).foregroundStyle(muted)
                    Text("Catch up").font(.system(size: 17, weight: .medium))
                    Spacer(minLength: 4)
                    HStack(spacing: 2) {
                        ForEach([30, 60, 90], id: \.self) { value in
                            Button { seconds = value } label: {
                                Text("\(value)s").font(.system(size: 11, design: .monospaced)).padding(.horizontal, 7).padding(.vertical, 6)
                                    .foregroundStyle(seconds == value ? ground : muted)
                                    .background(seconds == value ? Color(red: 0.88, green: 0.89, blue: 0.82) : .clear, in: RoundedRectangle(cornerRadius: 4))
                            }.buttonStyle(.plain).accessibilityLabel("Last \(value) seconds").accessibilityAddTraits(seconds == value ? .isSelected : [])
                        }
                    }.padding(3).background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
                    Button(action: onReturn) { Image(systemName: "xmark").font(.system(size: 12)).frame(width: 24, height: 28) }
                        .buttonStyle(.plain).foregroundStyle(muted).accessibilityLabel("Close catch up and return to live")
                }.padding(.horizontal, 16).padding(.vertical, 15)
                Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 23) {
                        if content.events.isEmpty {
                            VStack(spacing: 8) {
                                Text("Waiting for the conversation.").font(.system(size: 16))
                                Text("Words will appear here as they arrive.").font(.system(size: 12)).foregroundStyle(muted)
                            }.frame(maxWidth: .infinity).padding(.vertical, 36)
                        }
                        ForEach(CatchUpTurn.group(content.events)) { turn in
                            VStack(alignment: .leading, spacing: 7) {
                                HStack(spacing: 10) {
                                    Text(turn.role == .you ? "YOU" : turn.speaker == "SPEAKER" ? "OTHERS" : turn.speaker)
                                        .foregroundStyle(turn.role == .you ? Color(red: 0.79, green: 0.82, blue: 0.68) : muted)
                                    Text(stamp(CatchUpTurn.time(turn.events[0]))).foregroundStyle(muted.opacity(0.85))
                                }.font(.system(size: 10, design: .monospaced))
                                VStack(alignment: .leading, spacing: 4) {
                                    ForEach(turn.events) { event in
                                        Text(event.text).font(.system(size: 15)).lineSpacing(5).textSelection(.enabled)
                                            .frame(maxWidth: .infinity, alignment: .leading).id(event.id)
                                    }
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Color.clear.frame(height: 1).id("catch-up-bottom")
                    }.padding(.horizontal, 22).padding(.vertical, 20)
                }
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - 24
                } action: { _, bottom in atBottom = bottom; if bottom { seen = content.revision } }
                Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
                VStack(spacing: 10) {
                    Group {
                        if !content.notice.isEmpty { Text(content.notice).foregroundStyle(muted) }
                        else if !atBottom && content.revision > seen {
                            Button("New conversation below ↓") { proxy.scrollTo("catch-up-bottom", anchor: .bottom); seen = content.revision }
                                .buttonStyle(.plain).foregroundStyle(Color(red: 0.83, green: 0.87, blue: 0.74))
                        } else { Text("Conversation continues live").foregroundStyle(muted) }
                    }.font(.system(size: 11)).frame(height: 20).accessibilityAddTraits(.updatesFrequently)
                    Button(action: onReturn) {
                        HStack(spacing: 14) {
                            Text("Return to live").font(.system(size: 13, weight: .medium))
                            Text("Esc").font(.system(size: 10, design: .monospaced)).padding(.horizontal, 4).padding(.vertical, 1)
                                .overlay(RoundedRectangle(cornerRadius: 3).stroke(ground.opacity(0.3)))
                        }.frame(maxWidth: .infinity).padding(.vertical, 11).foregroundStyle(ground)
                            .background(Color(red: 0.875, green: 0.88, blue: 0.81), in: RoundedRectangle(cornerRadius: 6))
                    }.buttonStyle(.plain).keyboardShortcut(.escape, modifiers: [])
                }.padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 15)
            }
            .onAppear { seen = content.revision; if let target = CatchUpTurn.target(in: content.events, now: content.now, seconds: seconds) { proxy.scrollTo(target, anchor: .top) } }
            .onChange(of: seconds) { _, _ in if let target = CatchUpTurn.target(in: content.events, now: content.now, seconds: seconds) { proxy.scrollTo(target, anchor: .top) } }
        }
        .foregroundStyle(ink).background(ground).preferredColorScheme(.dark).ignoresSafeArea()
        .overlay {
            if draggingImage {
                VStack(spacing: 12) {
                    Image(systemName: "plus").font(.system(size: 28))
                    Text("Drop image into this meeting").font(.system(size: 15, weight: .medium))
                    Text("Saved beside the conversation at this moment.").font(.system(size: 12)).foregroundStyle(muted)
                }.frame(maxWidth: .infinity, maxHeight: .infinity).background(ground.opacity(0.97))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(muted, style: StrokeStyle(lineWidth: 1, dash: [5])).padding(7))
                    .allowsHitTesting(false)
            }
        }
        .onDrop(of: [UTType.image, UTType.fileURL], isTargeted: $draggingImage) { providers in onImages(providers); return true }
        .onPasteCommand(of: [.image, .fileURL], perform: onImages)
    }
}
