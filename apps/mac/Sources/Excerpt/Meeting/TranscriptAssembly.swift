import Foundation

/// Turning settled speech into a transcript worth extracting from.
///
/// Two things have to happen between "the recogniser settled some words" and "these
/// are the sentences somebody said", and both were visible the first time this ran
/// against real audio:
///
/// 1. **The recogniser settles on a clock, not on a sentence.** Asking it to finalize
///    everything older than a short tail cuts wherever the tail happens to fall, so
///    one sentence arrives as `"Let's move."` then `"the campaign launch to October."`
///    Extraction saw the first fragment as a complete sentence and called it a
///    decision. A false positive built out of half a sentence is the worst kind.
///
/// 2. **Without headphones both sources hear the same words.** Measured: every line
///    appeared twice, and the microphone's copy was labelled YOU — which turned the
///    speakers saying *"I'll take the revised deck"* into an action assigned to the
///    user. That is the one rule the product does not bend.
///
/// Both are decided here, over the finished transcript, rather than as each result
/// arrives: the two sources settle independently and interleave, so at arrival time
/// the counterpart may not exist yet. The journal keeps every raw segment — recovery
/// runs through this same function — and the meeting keeps the assembled sentences.
enum TranscriptAssembly {

    /// Segments closer together than this belong to the same utterance. Settling
    /// leaves abutting ranges; a real pause between sentences is much longer.
    static let utteranceGap: Double = 0.6

    /// How far two segments from one source may overlap and still be the recogniser
    /// re-reporting words it had already settled. Measured at a steady ~4 seconds on
    /// every consecutive pair of two real captures; 8 is headroom, not a guess at a
    /// different mechanism.
    static let maximumRevisionOverlap: Double = 8.0

    /// A turn longer than this is broken at the next sentence end.
    ///
    /// Continuous narration never pauses for `utteranceGap`, so one 3½-minute capture
    /// coalesced into four rows, two of them 243 and 284 words. That is unreadable as
    /// a transcript, and it makes every note built from it point at a 78-second block
    /// instead of at a sentence. Breaking only at a sentence end and only at a real
    /// segment boundary keeps both timestamps audio-aligned — nothing is interpolated.
    static let turnWordBudget = 80

    /// The shortest repeat worth splicing, and how alike it must be.
    static let minimumRepeat = 4
    static let maximumRepeat = 24
    static let repeatSimilarity: Double = 0.6

    /// How much of the shorter range must overlap before two segments can be the
    /// same words reaching two microphones.
    static let echoOverlap: Double = 0.5

    /// How alike the words must be, on top of overlapping in time.
    static let echoSimilarity: Double = 0.5

    static func assemble(_ raw: [TranscriptEvent]) -> [TranscriptEvent] {
        withoutEchoes(coalesce(raw))
    }

    // MARK: - Utterances

    /// Joins consecutive segments from one source whose audio abuts.
    static func coalesce(_ raw: [TranscriptEvent]) -> [TranscriptEvent] {
        var byRole: [SourceRole: [TranscriptEvent]] = [:]
        for event in raw.sorted(by: { ($0.tStart ?? $0.tArrived / 1000) < ($1.tStart ?? $1.tArrived / 1000) }) {
            byRole[event.role, default: []].append(event)
        }

        var joined: [TranscriptEvent] = []
        for (_, events) in byRole {
            var current: TranscriptEvent?
            for event in events {
                guard var running = current else { current = event; continue }
                let gap = (event.tStart ?? 0) - (running.tEnd ?? 0)

                // A negative gap is not a pause of impossible length — it is the two
                // ranges overlapping, which is the recogniser handing back seconds it
                // had already settled. Requiring `gap >= 0` here meant every one of
                // those pairs was kept as two rows, and the overlap was printed twice
                // in two different recognitions of it.
                let sameUtterance = gap < utteranceGap && gap > -maximumRevisionOverlap
                guard sameUtterance else {
                    joined.append(running)
                    current = event
                    continue
                }

                running.text = join(running.text, event.text, overlapping: gap < 0)
                running.tEnd = max(running.tEnd ?? 0, event.tEnd ?? 0)

                // The break is decided after joining, never before. Deciding first
                // would refuse to break a turn whose segments overlap — and those are
                // exactly the turns that run long — and it would break on the old
                // text, before the repeated words had been spliced out of it.
                if shouldBreak(running) {
                    joined.append(running)
                    current = nil
                } else {
                    current = running
                }
            }
            if let current { joined.append(current) }
        }

        return joined.sorted { ($0.tStart ?? 0) < ($1.tStart ?? 0) }
    }

    /// Whether a running turn is long enough to end here.
    ///
    /// Both conditions matter. The budget alone would cut mid-sentence, which is
    /// trap 9 in reverse and exactly how a fragment becomes a false decision. A
    /// sentence end alone would break every turn into single sentences and lose the
    /// grouping that makes a transcript readable.
    ///
    /// The recogniser does punctuate its own cuts, so a full stop here may be its
    /// opinion rather than the speaker's — but `toSentences` splits on that same full
    /// stop whether or not this does, so breaking at one cannot change what is
    /// extracted. It changes only how the transcript reads and how precisely a note
    /// points back into it.
    static func shouldBreak(_ event: TranscriptEvent) -> Bool {
        guard event.text.split(whereSeparator: \.isWhitespace).count >= turnWordBudget else { return false }
        return endsSentence(event.text)
    }

    static func endsSentence(_ text: String) -> Bool {
        guard let last = text.trimmingCharacters(in: .whitespaces)
            .last(where: { !"\"')]”’".contains($0) }) else { return false }
        return ".!?".contains(last)
    }

    /// Joins two settled fragments of one utterance.
    ///
    /// Two things happen at a settle boundary and neither is the speaker's doing. The
    /// analyzer punctuates the cut, so a full stop there is the recogniser's opinion
    /// and not the end of a sentence. And it sometimes re-reports the same span with
    /// more words on the end, having heard further — concatenating those gives the
    /// sentence twice over.
    static func join(_ left: String, _ right: String, overlapping: Bool = false) -> String {
        let head = left.trimmingCharacters(in: .whitespaces)
        let tail = right.trimmingCharacters(in: .whitespaces)
        guard !tail.isEmpty else { return head }
        guard !head.isEmpty else { return tail }

        // A revision rather than a continuation: keep the fuller one.
        let a = normalizedForComparison(head), b = normalizedForComparison(tail)
        if !a.isEmpty, b.contains(a) { return tail }
        if !b.isEmpty, a.contains(b) { return head }

        if overlapping, let spliced = spliceRepeat(head, tail) { return spliced }

        var joined = head
        if tail.first?.isLowercase == true, let last = joined.last, last == "." || last == "," {
            joined.removeLast()
        }
        return "\(joined) \(tail)"
    }

    static func normalizedForComparison(_ text: String) -> String {
        tokens(of: text).joined(separator: " ")
    }

    /// Removes the words the new segment opens by repeating, and keeps its reading
    /// of them.
    ///
    /// The re-reported seconds are recognised again, and differently: *Elsie Ramo*
    /// came back as *Elsie Reclamo*, *Paolo Martel* as *Paulo Martel*. Exact
    /// containment cannot see that, so both spellings reached the notes as two
    /// separate points. Dropping the later segment instead is trap 11 — it once took
    /// `by Thursday` and the deadline with it — so the repeat is cut from the head
    /// and everything the later segment heard after it is kept.
    ///
    /// The later reading wins because it is the one made with more audio behind it.
    static func spliceRepeat(_ head: String, _ tail: String) -> String? {
        let headRanges = tokenRanges(of: head)
        let headTokens = headRanges.map { head[$0].lowercased() }
        let tailTokens = tokenRanges(of: tail).map { tail[$0].lowercased() }
        let headWindow = min(maximumRepeat, headTokens.count)
        let tailWindow = min(maximumRepeat, tailTokens.count)
        guard headWindow >= minimumRepeat, tailWindow >= minimumRepeat else { return nil }

        // The two sides of a repeat are not the same length. The recogniser inserts
        // and drops words as it re-hears: "Elsie Ramo, I know that's not your real
        // name, but" came back as "Elsie Reclamo, uh, I know that's not your real
        // name, but hi" — eleven words answered by twelve. Forcing one length made a
        // window that reached back past the repeat score higher than the repeat
        // itself, and "go" was cut out of "Well, here you go."
        var best: (head: Int, tail: Int, score: Double)?
        for ending in stride(from: headWindow, through: minimumRepeat, by: -1) {
            for opening in stride(from: tailWindow, through: minimumRepeat, by: -1) {
                let score = repeatScore(Array(headTokens.suffix(ending)), Array(tailTokens.prefix(opening)))
                guard score >= repeatSimilarity else { continue }
                // >= while walking down keeps the tightest of equally good matches.
                if score >= (best?.score ?? 0) { best = (ending, opening, score) }
            }
        }
        guard let best else { return nil }
        let cut = headRanges[headTokens.count - best.head].lowerBound
        let kept = head[..<cut].trimmingCharacters(in: .whitespaces)
        return kept.isEmpty ? tail : "\(kept) \(tail)"
    }

    // MARK: - Echoes

    /// Drops microphone utterances that are the far side arriving through the speakers.
    ///
    /// Only the microphone's copy is ever dropped. The far side is what the far side
    /// said; the microphone is only trusted to say what *you* said, and a copy of
    /// somebody else's words is exactly the thing it must not be believed about.
    static func withoutEchoes(_ events: [TranscriptEvent]) -> [TranscriptEvent] {
        let remote = events.filter { $0.role == .remote }
        guard !remote.isEmpty else { return events }

        return events.filter { event in
            guard event.role == .you else { return true }
            return !remote.contains { isEcho(event, of: $0) }
        }
    }

    static func isEcho(_ candidate: TranscriptEvent, of remote: TranscriptEvent) -> Bool {
        guard let start = candidate.tStart, let end = candidate.tEnd,
              let otherStart = remote.tStart, let otherEnd = remote.tEnd else {
            return false        // without a shared clock there is nothing to compare
        }

        let overlap = min(end, otherEnd) - max(start, otherStart)
        let shorter = min(end - start, otherEnd - otherStart)
        guard shorter > 0, overlap / shorter >= echoOverlap else { return false }

        return similarity(candidate.text, remote.text) >= echoSimilarity
    }

    /// Shared words as a fraction of the smaller utterance. Deliberately not exact
    /// equality: the two microphones hear the same sentence differently, and the
    /// speakers' copy is always the worse of the two.
    static func similarity(_ left: String, _ right: String) -> Double {
        similarity(of: tokens(of: left), tokens(of: right))
    }

    static func similarity(of left: [String], _ right: [String]) -> Double {
        let a = Set(left), b = Set(right)
        guard !a.isEmpty, !b.isEmpty else { return 0 }
        return Double(a.intersection(b).count) / Double(min(a.count, b.count))
    }

    /// How much of two word runs is the same run, as a fraction of their combined
    /// length. Order matters — these are sentences, not bags of words — so this is
    /// the longest common subsequence rather than a set intersection.
    ///
    /// Words count as the same when they are near-identical, because the second
    /// hearing is a different recognition of the same sound: *adviser* / *advisor*,
    /// *Paolo* / *Paulo*. Demanding exact equality scored the real repeat below the
    /// threshold and left the sentence in twice.
    static func repeatScore(_ left: [String], _ right: [String]) -> Double {
        guard !left.isEmpty, !right.isEmpty else { return 0 }
        var table = [[Int]](repeating: [Int](repeating: 0, count: right.count + 1), count: left.count + 1)
        for i in 1...left.count {
            for j in 1...right.count {
                table[i][j] = sameWord(left[i - 1], right[j - 1])
                    ? table[i - 1][j - 1] + 1
                    : max(table[i - 1][j], table[i][j - 1])
            }
        }
        return 2 * Double(table[left.count][right.count]) / Double(left.count + right.count)
    }

    /// Equal, or one hearing of the other. The allowance grows with length so that
    /// short words still have to match exactly.
    static func sameWord(_ left: String, _ right: String) -> Bool {
        if left == right { return true }
        let shorter = min(left.count, right.count)
        guard shorter >= 4, abs(left.count - right.count) <= 2 else { return false }
        return editDistance(Array(left), Array(right)) <= (shorter >= 7 ? 2 : 1)
    }

    static func editDistance(_ left: [Character], _ right: [Character]) -> Int {
        var previous = Array(0...right.count)
        for i in 1...left.count {
            var current = [i] + [Int](repeating: 0, count: right.count)
            for j in 1...right.count {
                current[j] = left[i - 1] == right[j - 1]
                    ? previous[j - 1]
                    : 1 + min(previous[j], current[j - 1], previous[j - 1])
            }
            previous = current
        }
        return previous[right.count]
    }

    static func tokens(of text: String) -> [String] {
        tokenRanges(of: text).map { text[$0].lowercased() }
    }

    /// Where each word sits in the original string, so a repeat found by comparing
    /// words can be cut out of the text it came from.
    static func tokenRanges(of text: String) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        var start: String.Index?
        for index in text.indices {
            if text[index].isLetter || text[index].isNumber {
                if start == nil { start = index }
            } else if let from = start {
                ranges.append(from..<index)
                start = nil
            }
        }
        if let from = start { ranges.append(from..<text.endIndex) }
        return ranges
    }
}
