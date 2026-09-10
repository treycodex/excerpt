import Testing
@testable import ExcerptSpike

/// `CaptionStyle.resolve` is where every caption decision is made, which is the whole
/// reason it is a pure function: the rules that matter most — the ones that override
/// the user's chosen look — can be checked without a window, a screen, or an eye.
@MainActor
struct CaptionStyleTests {
    private func resolve(
        preset: CaptionPreset = .classic,
        size: CaptionSize = .medium,
        position: CaptionPosition = .standard,
        increaseContrast: Bool = false,
        reduceMotion: Bool = false
    ) -> CaptionStyle {
        CaptionStyle.resolve(preset: preset, size: size, position: position,
                             screenWidth: 1710,
                             increaseContrast: increaseContrast, reduceMotion: reduceMotion)
    }

    @Test func `Classic has no plate behind it`() {
        #expect(resolve().preset.backdrop == nil)
    }

    @Test func `Increase Contrast puts a plate behind a preset that has none`() {
        let style = resolve(increaseContrast: true)
        #expect(style.preset.backdrop == CaptionTokens.contrast.backdrop)
        #expect(style.preset.shadows.isEmpty)
        #expect(style.preset.padding.leading == CaptionTokens.contrast.padding.leading)
    }

    @Test func `Increase Contrast leaves Warm's colour alone`() {
        // The override is about legibility, not about discarding the choice: the amber
        // is what the user picked, and a plate makes it legible without replacing it.
        let style = resolve(preset: .warm, increaseContrast: true)
        #expect(style.preset.color == CaptionTokens.warm.color)
        #expect(style.preset.backdrop != nil)
    }

    @Test func `Reduce Motion removes the fade rather than shortening it`() {
        #expect(resolve(reduceMotion: true).fade == 0)
        #expect(resolve().fade == CaptionTokens.fade)
    }

    @Test func `Size steps either side of the token size`() {
        let small = resolve(size: .small).fontSize
        let medium = resolve(size: .medium).fontSize
        let large = resolve(size: .large).fontSize
        #expect(small < medium && medium < large)
        #expect(medium == CaptionTokens.sizeMax)   // 0.024 x 1710 clamps to the token's max
    }

    @Test func `Tracking is a size, not a constant`() {
        // Apple's rule: tracking is size-specific. Storing it in em is what makes that
        // true rather than aspirational.
        #expect(resolve(size: .large).tracking > resolve(size: .small).tracking)
    }

    @Test func `A plated line takes its padding out of the gap, never adds to it`() {
        // Otherwise the two bars of a High contrast caption drift apart instead of
        // stacking the way the web's line boxes do.
        #expect(resolve(preset: .contrast).lineGap < resolve(preset: .classic).lineGap)
        #expect(resolve(preset: .contrast).lineGap >= 0)
    }

    @Test func `Position moves the caption without leaving the screen`() {
        for position in CaptionPosition.allCases {
            let fraction = resolve(position: position).centreFraction
            #expect(fraction > 0.5 && fraction < 1.0)
        }
    }

    @Test func `A line never runs the full width of a wide screen`() {
        #expect(resolve().maxWidth < 1710 * 0.85)
    }
}
