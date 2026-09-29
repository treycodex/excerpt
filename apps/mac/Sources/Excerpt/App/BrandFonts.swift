import CoreText
import Foundation
import AppKit
import SwiftUI

/// Excerpt's typefaces for native surfaces, from the same files the notes pages load.
///
/// The fonts ship once, inside `notes/fonts`, for the web view. CoreText reads WOFF2,
/// so native windows register those files for this process rather than bundling a
/// second copy. When they are missing — `swift test`, a bare executable — every
/// accessor falls back to the system face at the same size, so nothing breaks, it
/// only looks less like Excerpt.
enum BrandFonts {
    private static let registered: Bool = {
        guard let folder = Bundle.main.url(forResource: "notes", withExtension: nil)?
            .appendingPathComponent("fonts"),
            let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
        else { return false }
        var any = false
        for file in files where file.pathExtension == "woff2" {
            if CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil) { any = true }
        }
        return any
    }()

    /// Chrome: IBM Plex Mono. Used uppercase and letter-spaced, as on the web.
    static func mono(_ size: CGFloat) -> Font {
        registered ? .custom("IBM Plex Mono", size: size) : .system(size: size, design: .monospaced)
    }

    /// Where you read rather than are sold to, and the turn at the end of a headline.
    static func serif(_ size: CGFloat) -> Font {
        registered ? .custom("InstrumentSerif-Regular", size: size) : .system(size: size, design: .serif)
    }

    /// Interface and headings: Archivo. It is one variable file, and SwiftUI's
    /// `.weight` does not reach its axis, so the weight is set on the axis itself —
    /// 400 to 900, as in CSS.
    static func sans(_ size: CGFloat, weight: CGFloat = 400) -> Font {
        let wght = 0x7767_6874 // 'wght'
        guard registered,
              // The file's family name reads "Archivo SemiBold"; the named instance is exact.
              let base = NSFont(name: "ArchivoRoman-Regular", size: size)
        else { return .system(size: size, weight: systemWeight(weight)) }
        let descriptor = base.fontDescriptor.addingAttributes([
            NSFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wght: weight],
        ])
        return Font(NSFont(descriptor: descriptor, size: size) ?? base)
    }

    private static func systemWeight(_ weight: CGFloat) -> Font.Weight {
        switch weight {
        case ..<450: .regular
        case ..<550: .medium
        case ..<650: .semibold
        case ..<750: .bold
        case ..<850: .heavy
        default: .black
        }
    }
}
