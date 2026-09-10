import AppKit
import SwiftUI

/// Motif 1: the subtitle itself, directly over the meeting. Two lines maximum,
/// centred, no panel, no controls, no box — except where legibility demands one.
struct CaptionOverlayView: View {
    let controller: OverlayController

    /// Both of these are the macOS half of a rule the web already follows, not a
    /// separate Mac behaviour: Increase Contrast is `prefers-contrast: more`, and
    /// Reduce Motion is `prefers-reduced-motion: reduce`.
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geometry in
            let style = CaptionStyle.resolve(
                preset: controller.preset,
                size: controller.size,
                position: controller.position,
                screenWidth: geometry.size.width,
                increaseContrast: contrast == .increased,
                reduceMotion: reduceMotion
            )

            ZStack {
                Color.clear
                if let caption = controller.caption {
                    block(caption, style: style)
                        .frame(maxWidth: style.maxWidth)
                        .position(x: geometry.size.width / 2,
                                  y: geometry.size.height * style.centreFraction)
                        .transition(.opacity)
                }
            }
            // A caption *arriving* fades in. One line replacing another is a cut, as
            // film subtitles are — so the animation is keyed on whether there is a
            // caption at all, never on its text.
            .animation(
                style.fade > 0 ? .timingCurve(CaptionStyle.easeOut, duration: style.fade) : nil,
                value: controller.caption != nil
            )
        }
        .allowsHitTesting(false)
    }

    private func block(_ caption: OverlayController.CaptionLine, style: CaptionStyle) -> some View {
        VStack(spacing: CaptionStyle.speakerGap) {
            Text(caption.speaker)
                .font(.system(size: CaptionStyle.speakerSize, weight: .regular, design: .monospaced))
                .tracking(CaptionStyle.speakerTracking)
                .foregroundStyle(CaptionStyle.speakerColor)
                .shadow(color: .black.opacity(0.9), radius: 2, y: 1)

            // Each line carries its own plate, so a two-line caption in the High
            // contrast look reads as two bars hugging the text rather than one
            // ragged rectangle. This is the web's `box-decoration-break: clone`.
            VStack(spacing: style.lineGap) {
                ForEach(Array(lines(of: caption.text, style: style).enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: style.fontSize, weight: CaptionTokens.weight))
                        .tracking(style.tracking)
                        .foregroundStyle(style.preset.color)
                        .fixedSize(horizontal: false, vertical: true)
                        .modifier(TextShadows(shadows: style.preset.shadows))
                        .padding(style.preset.padding)
                        .background(style.preset.backdrop)
                }
            }
            .multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(caption.speaker) said: \(caption.text)")
    }

    /// The last two lines of the wrapped text. Last, not first: the words being
    /// spoken now are the ones worth reading.
    ///
    /// Wrapping is done here rather than left to `Text` because the two-line rule is
    /// a rule about content, not about the width of a window — and because a plate
    /// per line needs to know where the lines are. In the product this comes from the
    /// shared engine, so there is one phrase breaker rather than two.
    private func lines(of text: String, style: CaptionStyle) -> [String] {
        let font = NSFont.systemFont(ofSize: style.fontSize)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: style.tracking]
        func width(_ s: String) -> CGFloat { (s as NSString).size(withAttributes: attributes).width }

        var wrapped: [String] = []
        var current = ""
        for word in text.split(separator: " ", omittingEmptySubsequences: true).map(String.init) {
            let candidate = current.isEmpty ? word : current + " " + word
            if current.isEmpty || width(candidate) <= style.maxWidth {
                current = candidate
            } else {
                wrapped.append(current)
                current = word
            }
        }
        if !current.isEmpty { wrapped.append(current) }
        return Array(wrapped.suffix(style.maxLines))
    }
}

/// A CSS text-shadow list is a list; SwiftUI's shadow is one modifier. This applies
/// them in the order the token declares, which is the order the browser paints them.
private struct TextShadows: ViewModifier {
    let shadows: [CaptionTokens.Shadow]

    func body(content: Content) -> some View {
        shadows.reduce(AnyView(content)) { view, shadow in
            AnyView(view.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y))
        }
    }
}
