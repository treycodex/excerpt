import AppKit
import SwiftUI

/// A non-activating confirmation for an explicit capture. It shows enough to catch
/// the wrong region immediately and leaves keyboard focus in the meeting.
@MainActor
final class CaptureReceiptController {
    private var panel: NSPanel?
    private var dismiss: Task<Void, Never>?

    func show(_ image: MeetingImage) {
        dismiss?.cancel()
        panel?.orderOut(nil)

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 286, height: 92),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.ignoresMouseEvents = true
        panel.contentView = NSHostingView(rootView: CaptureReceiptView(image: image))

        let screen = NSScreen.screens.first { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) } ?? NSScreen.main
        if let area = screen?.visibleFrame {
            panel.setFrameOrigin(NSPoint(x: area.maxX - panel.frame.width - 22, y: area.maxY - panel.frame.height - 22))
        }
        panel.orderFrontRegardless()
        self.panel = panel
        dismiss = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            self?.panel?.orderOut(nil)
            self?.panel = nil
        }
    }
}

private struct CaptureReceiptView: View {
    let image: MeetingImage

    private var thumbnail: NSImage? {
        guard let comma = image.dataUrl.firstIndex(of: ","),
              let data = Data(base64Encoded: String(image.dataUrl[image.dataUrl.index(after: comma)...])) else { return nil }
        return NSImage(data: data)
    }

    private var time: String {
        String(format: "%d:%02d", Int(image.at / 60_000), Int(image.at / 1_000) % 60)
    }

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let thumbnail { Image(nsImage: thumbnail).resizable().scaledToFill() }
                else { Color.black.opacity(0.3) }
            }
            .frame(width: 92, height: 64).clipped().cornerRadius(5)
            VStack(alignment: .leading, spacing: 5) {
                Text("Added to notes").font(.system(size: 14, weight: .semibold))
                Text("\(time) · Captured moment").font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
                Text("Add a caption in Notes").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12).foregroundStyle(Color.white)
        .background(Color(red: 0.12, green: 0.125, blue: 0.115).opacity(0.97), in: RoundedRectangle(cornerRadius: 10))
    }
}
