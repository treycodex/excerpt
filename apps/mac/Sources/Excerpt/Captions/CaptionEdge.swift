import Foundation

/// The live edge of speech — what a subtitle shows while someone is still talking —
/// and which of the two sources owns it.
///
/// Pure, like `TranscriptAssembly`, and for the same reason: these rules are judged by
/// eye on a moving screen, which is the hardest kind of behaviour to be sure of. Held
/// as plain values, they can be held still by a test instead.
enum CaptionEdge {

    /// The card currently on screen — a subtitle, not a teleprompter.
    ///
    /// Both lists, not just the unsettled one. `SourceTranscriber` moves a region out of
    /// `pending` and into the transcript the moment the analyzer's volatile window
    /// passes it, so a caption built from `pending` alone would shorten every time the
    /// transcript advanced — words disappearing from the screen because their status
    /// changed behind it, several times a sentence. Spanning both makes settling
    /// invisible, which is what it always should have been.
    ///
    /// **Why a card rather than a window onto the tail.** This used to hand the line
    /// breaker a long rolling tail and let it keep the last two lines. Two lines hold
    /// about 84 characters, so most of that tail was thrown away — and *which* words
    /// survived shifted by one on every result. The text crawled through a two-line
    /// window and the break point crawled with it, so both lines could change on every
    /// update. That is a teleprompter, and no amount of smoothing the update rate makes
    /// it read as a subtitle.
    ///
    /// Film cuts instead. A subtitle appears, holds still, and is replaced. So the words
    /// are partitioned into cards from the *beginning* of the utterance, and the last
    /// card is shown. Because the partition depends only on what came before, a card's
    /// boundaries can never move once it has started: the open card grows by appending
    /// until it is full, and then the screen cuts to a new one. Nothing slides.
    ///
    /// Cards close on a sentence ending as well as on a full second line, because that
    /// is where a film subtitle cuts — and never while a card is too short to have been
    /// read, so `"Okay."` rides along with what follows instead of flashing on its own.
    static func card(
        settled: [Segment],
        pending: [Segment],
        maxChars: Int = CaptionTokens.maxCharsPerLine,
        maxLines: Int = CaptionTokens.maxLines
    ) -> String {
        let ordered = (settled + pending).sorted { $0.start < $1.start }
        // The analyzer sometimes emits punctuation as a result of its own, even
        // during silence. It must not become a subtitle card or displace speech.
        let text = ordered.filter { segment in
            segment.text.contains { $0.isLetter || $0.isNumber }
        }.map(\.text).joined(separator: " ")
            .replacingOccurrences(of: #"[.…]{2,}"#, with: "…", options: .regularExpression)
        let words = text.split(whereSeparator: { $0.isWhitespace }).filter { word in
            !word.allSatisfy { $0 == "." || $0 == "…" }
        }

        var closed: [Substring] = []          // the last card that has been cut away from
        var open: [Substring] = []
        var lines = 1
        var lineLength = 0

        func cut() {
            closed = open
            open = []
            lines = 1
            lineLength = 0
        }

        for word in words {
            let cost = lineLength == 0 ? word.count : word.count + 1
            if lineLength + cost <= maxChars {
                lineLength += cost
            } else if lines < maxLines {
                lines += 1
                lineLength = word.count
            } else {
                cut()
                lineLength = word.count
            }
            open.append(word)

            // A sentence has ended and there is enough on screen to have been read.
            // Measured against the card, not the line: a card is what a viewer takes in.
            if Self.endsSentence(word), open.joined(separator: " ").count >= minimumCard {
                cut()
            }
        }

        // The open card is what is being spoken now. When a sentence just closed there
        // is nothing open yet, and the card that closed is still the one to read — a
        // subtitle holds until the next one replaces it rather than blinking out.
        return (open.isEmpty ? closed : open).joined(separator: " ")
    }

    /// Below this a card is a flash rather than a subtitle.
    private static let minimumCard = 16

    private static func endsSentence(_ word: Substring) -> Bool {
        guard let last = word.last else { return false }
        return ".?!…".contains(last)
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
