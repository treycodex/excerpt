import SwiftUI

/// The subtitle itself. Two lines maximum, centred, white, a thin shadow for
/// legibility, fades only — never a slide, never a box.
///
/// Line breaking is deliberately naive here: in the product it comes from the
/// shared TypeScript engine so there is one phrase-breaking implementation, not two.
struct CaptionOverlayView: View {
    @ObservedObject var controller: OverlayController

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.clear
            if let caption = controller.caption {
                VStack(spacing: 10) {
                    Text(caption.speaker)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .tracking(4)
                        .foregroundStyle(.white.opacity(0.7))
                        .shadow(color: .black.opacity(0.9), radius: 2, y: 1)

                    Text(caption.text)
                        .font(.system(size: 30, weight: .regular))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .truncationMode(.head)      // keep the words being spoken now
                        .shadow(color: .black.opacity(0.9), radius: 2, y: 1)
                        .shadow(color: .black.opacity(0.75), radius: 14)
                        .padding(.horizontal, 90)
                }
                .padding(.bottom, 40)
                .transition(.opacity)
                .id(caption.text)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: controller.caption)
        .allowsHitTesting(false)
    }
}
