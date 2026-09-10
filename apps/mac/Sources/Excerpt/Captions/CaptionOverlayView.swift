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
            // Each line carries its own plate, so a two-line caption in the High
            // contrast look reads as two bars hugging the text rather than one
            // ragged rectangle. This is the web's `box-decoration-break: clone`.
            VStack(spacing: style.lineGap) {
                ForEach(Array(caption.lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(Font(style.font))
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

    // Lines arrive already broken, by the shared engine, in `OverlayController.update`.
    // They used to be wrapped here, inside `body`, by measuring every word — ten times
    // a second, on a string that grows while someone talks. Two things were wrong with
    // that. Breaking on width rather than on phrase boundaries contradicts the rule the
    // website follows and the design is named after; and re-wrapping a growing string
    // reflows it, so each new word could shove a word across the break and shuffle the
    // whole block. That shuffle was most of what read as jitter.
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
