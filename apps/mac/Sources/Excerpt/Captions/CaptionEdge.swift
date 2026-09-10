import Foundation

/// The live edge of speech — what a subtitle shows while someone is still talking —
/// and which of the two sources owns it.
///
/// Pure, like `TranscriptAssembly`, and for the same reason: these rules are judged by
/// eye on a moving screen, which is the hardest kind of behaviour to be sure of. Held
/// as plain values, they can be held still by a test instead.
enum CaptionEdge {

    /// Settled speech and speech still being revised, joined in the order it was said,
    /// trimmed to the tail that will fit on screen.
    ///
    /// Both lists, not just the unsettled one. `SourceTranscriber` moves a region out of
    /// `pending` and into the transcript the moment the analyzer's volatile window
    /// passes it, so a caption built from `pending` alone would shorten every time the
    /// transcript advanced — words disappearing from the screen because their status
    /// changed behind it, several times a sentence. Spanning both makes settling
    /// invisible, which is what it always should have been.
    ///
    /// The trim keeps the tail and never splits a word. Tail because the words being
    /// spoken now are the ones being read — the same rule `splitIntoSubtitleLines`
    /// follows when it drops the head of a long line.
    static func text(settled: [Segment], pending: [Segment], limit: Int = 220) -> String {
        let ordered = (settled + pending).sorted { $0.start < $1.start }
        let joined = ordered.map(\.text).joined(separator: " ")
            .split(separator: " ", omittingEmptySubsequences: true)

        var kept: [Substring] = []
        var length = 0
        for word in joined.reversed() {
            let cost = kept.isEmpty ? word.count : word.count + 1
            if !kept.isEmpty, length + cost > limit { break }
            kept.append(word)
            length += cost
        }
        return kept.reversed().joined(separator: " ")
    }

    /// Whoever spoke most recently owns the caption. `nil` means neither source has
    /// anything to show.
    ///
    /// Both ends must already be on a shared clock. They arrive as each source's own
    /// frames-fed seconds, and the two sources do not start at the same instant — so
    /// comparing them raw hands whichever stream's first buffer landed earlier a
    /// permanent lead, and the caption sits on one speaker while the other talks.
    /// `MeetingClock` exists to correct exactly this and was not being asked.
    static func owner(you: Double?, remote: Double?) -> SourceRole? {
        switch (you, remote) {
        case (nil, nil): nil
        case (_?, nil): .you
        case (nil, _?): .remote
        case let (mine?, theirs?): mine >= theirs ? .you : .remote
        }
    }
}
