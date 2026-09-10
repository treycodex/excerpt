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

                if gap >= 0, gap < utteranceGap {
                    running.text = join(running.text, event.text)
                    running.tEnd = event.tEnd
                    current = running
                } else {
                    joined.append(running)
                    current = event
                }
            }
            if let current { joined.append(current) }
        }

        return joined.sorted { ($0.tStart ?? 0) < ($1.tStart ?? 0) }
    }

    /// Joins two settled fragments of one utterance.
    ///
    /// Two things happen at a settle boundary and neither is the speaker's doing. The
    /// analyzer punctuates the cut, so a full stop there is the recogniser's opinion
    /// and not the end of a sentence. And it sometimes re-reports the same span with
    /// more words on the end, having heard further — concatenating those gives the
    /// sentence twice over.
    static func join(_ left: String, _ right: String) -> String {
        let head = left.trimmingCharacters(in: .whitespaces)
        let tail = right.trimmingCharacters(in: .whitespaces)
        guard !tail.isEmpty else { return head }
        guard !head.isEmpty else { return tail }

        // A revision rather than a continuation: keep the fuller one.
        let a = normalizedForComparison(head), b = normalizedForComparison(tail)
        if !a.isEmpty, b.contains(a) { return tail }
        if !b.isEmpty, a.contains(b) { return head }

        var joined = head
        if tail.first?.isLowercase == true, let last = joined.last, last == "." || last == "," {
            joined.removeLast()
        }
        return "\(joined) \(tail)"
    }

    static func normalizedForComparison(_ text: String) -> String {
        tokens(of: text).joined(separator: " ")
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
        let a = Set(tokens(of: left)), b = Set(tokens(of: right))
        guard !a.isEmpty, !b.isEmpty else { return 0 }
        return Double(a.intersection(b).count) / Double(min(a.count, b.count))
    }

    static func tokens(of text: String) -> [String] {
        text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }
}
