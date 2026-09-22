import AppKit
import SwiftUI

/// Which look the caption wears. Three, and the plan is explicit that three is the
/// number — a fourth would be a preference, not a choice.
enum CaptionPreset: String, CaseIterable, Identifiable, Sendable, Codable {
    case classic, warm, contrast

    var id: String { rawValue }

    /// Named for what the user sees, not for how it is drawn.
    var title: String {
        switch self {
        case .classic: "Cinema"
        case .warm: "Golden hour"
        case .contrast: "Screenplay"
        }
    }

    /// One line, no jargon, saying when to pick it. A label that needs explaining is
    /// a weak mapping; a label plus one plain sentence is a good one.
    var explanation: String {
        switch self {
        case .classic: "White text, no box. Like film subtitles."
        case .warm: "Yellow italic text. Inspired by classic film subtitles."
        case .contrast: "White monospace on a dark backing. Clear over busy scenes."
        }
    }

    var symbol: String {
        switch self {
        case .classic: "textformat"
        case .warm: "sun.max"
        case .contrast: "circle.lefthalf.filled"
        }
    }

    var tokens: CaptionTokens.Preset {
        switch self {
        case .classic: CaptionTokens.classic
        case .warm: CaptionTokens.warm
        case .contrast: CaptionTokens.contrast
        }
    }
}

/// How big. The token already answers "how big on this screen"; this is the nudge
/// either side of it, which is the only part a person actually wants to change.
enum CaptionSize: String, CaseIterable, Identifiable, Sendable, Codable {
    case small, medium, large

    var id: String { rawValue }

    var title: String {
        switch self {
        case .small: "Small"
        case .medium: "Medium"
        case .large: "Large"
        }
    }

    var scale: CGFloat {
        switch self {
        case .small: 0.8
        case .medium: 1.0
        case .large: 1.3
        }
    }
}

/// How high up the screen. Meeting apps put their own controls along the bottom
/// edge, so "lower" has to stay clear of them rather than sit under them.
enum CaptionPosition: String, CaseIterable, Identifiable, Sendable, Codable {
    case lower, standard, higher

    var id: String { rawValue }

    var title: String {
        switch self {
        case .lower: "Lower"
        case .standard: "Standard"
        case .higher: "Higher"
        }
    }

    /// Distance from the top of the screen to the caption's vertical centre.
    var centreFraction: CGFloat {
        switch self {
        case .lower: CaptionTokens.centreFraction + 0.08
        case .standard: CaptionTokens.centreFraction
        case .higher: CaptionTokens.centreFraction - 0.10
        }
    }
}

/// Everything the overlay needs to draw one caption, already resolved. The view does
/// no deciding; every choice — including the accessibility overrides — is made here,
/// where it can be read and tested without a window on screen.
struct CaptionStyle: Equatable {
    var preset: CaptionTokens.Preset
    var fontSize: CGFloat
    /// Points, not em. Tracking is size-specific, so it is only meaningful once the
    /// size is known.
    var tracking: CGFloat
    /// The gap to put *between* rendered lines so that the distance from one line to
    /// the next matches the web's line-height. Not the leading itself: a line already
    /// occupies the font's own line height, and a plated preset also occupies its
    /// padding, so both have to come out of the gap or the lines drift apart.
    var lineGap: CGFloat
    var centreFraction: CGFloat
    var maxWidth: CGFloat
    var maxLines: Int
    var maxCharsPerLine: Int
    var fade: Double

    /// Chrome above the caption: mono, wide-tracked, dimmed. Values from `.who` in
    /// apps/editor/src/app.css — chrome lives there rather than in the token file.
    static let speakerSize: CGFloat = 11
    static let speakerTracking: CGFloat = 11 * 0.28
    static let speakerColor = Color(.sRGB, red: 0.706, green: 0.706, blue: 0.706, opacity: 1)
    static let speakerGap: CGFloat = 12

    /// The web's `--ease-out`, so a caption arrives on both surfaces with the same curve.
    static let easeOut = UnitCurve.bezier(
        startControlPoint: .init(x: 0.23, y: 1),
        endControlPoint: .init(x: 0.32, y: 1)
    )

    /// Accessibility outranks the chosen look, and it outranks it the same way on both
    /// surfaces: Increase Contrast puts a plate behind a preset that has none — the web's
    /// `prefers-contrast: more` rule — and Reduce Motion removes the fade rather than
    /// shortening it. Neither is a special case; the no-box subtitle was always a default
    /// and never a constraint on legibility.
    static func resolve(
        preset: CaptionPreset,
        size: CaptionSize,
        position: CaptionPosition,
        screenWidth: CGFloat,
        increaseContrast: Bool,
        reduceMotion: Bool
    ) -> CaptionStyle {
        var tokens = preset.tokens
        if increaseContrast, tokens.backdrop == nil {
            tokens.backdrop = CaptionTokens.contrast.backdrop
            tokens.padding = CaptionTokens.contrast.padding
            tokens.shadows = CaptionTokens.contrast.shadows
        }

        // The same clamp the CSS evaluates, with the screen standing in for the viewport.
        let base = min(max(CaptionTokens.sizeMin, CaptionTokens.sizeViewportFactor * screenWidth),
                       CaptionTokens.sizeMax)
        let fontSize = (base * size.scale).rounded()

        return CaptionStyle(
            preset: tokens,
            fontSize: fontSize,
            tracking: fontSize * CaptionTokens.trackingEm,
            lineGap: CaptionStyle.gap(atSize: fontSize, preset: tokens),
            centreFraction: position.centreFraction,
            maxWidth: CaptionStyle.measuredWidth(ofCharacters: CaptionTokens.maxCharsPerLine,
                                                 atSize: fontSize, preset: tokens,
                                                 limitedBy: screenWidth),
            maxLines: CaptionTokens.maxLines,
            maxCharsPerLine: CaptionTokens.maxCharsPerLine,
            fade: reduceMotion ? 0 : CaptionTokens.fade
        )
    }

    var font: NSFont { Self.font(for: preset, size: fontSize) }

    private static func font(for preset: CaptionTokens.Preset, size: CGFloat) -> NSFont {
        let base = NSFont(name: preset.fontName, size: size) ?? NSFont.systemFont(ofSize: size)
        let weight: NSFont.Weight = preset.fontWeight >= 600 ? .semibold : preset.fontWeight >= 500 ? .medium : .regular
        let descriptor = base.fontDescriptor.addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight.rawValue]])
        let weighted = NSFont(descriptor: descriptor, size: size) ?? base
        return preset.italic ? NSFontManager.shared.convert(weighted, toHaveTrait: .italicFontMask) : weighted
    }

    /// The web sets `line-height: 1.35`, which makes each line box 1.45em tall and
    /// paints the plate over that box — so consecutive plates touch. Reproduce that
    /// pitch rather than the number: subtract what the line and its plate already take.
    private static func gap(atSize size: CGFloat, preset: CaptionTokens.Preset) -> CGFloat {
        let lineHeight = NSLayoutManager().defaultLineHeight(for: font(for: preset, size: size))
        return max(0, size * CaptionTokens.leading - lineHeight - preset.padding.top - preset.padding.bottom)
    }

    /// The line length the 42-character rule actually implies, measured rather than
    /// guessed at: a lowercase alphabet in the real font, divided by its length.
    private static func measuredWidth(ofCharacters count: Int, atSize size: CGFloat, preset: CaptionTokens.Preset, limitedBy screenWidth: CGFloat) -> CGFloat {
        let font = font(for: preset, size: size)
        let sample = "abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz"
        let perCharacter = (sample as NSString)
            .size(withAttributes: [.font: font]).width / CGFloat(sample.count)
        return min(CGFloat(count) * perCharacter, screenWidth * 0.8)
    }
}
