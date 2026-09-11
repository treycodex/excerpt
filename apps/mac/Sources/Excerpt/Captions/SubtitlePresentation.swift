import Foundation

/// Presentation timing only. Recognition and the saved transcript remain untouched.
/// Freeze a readable snapshot while the recognizer revises the next one off screen.
struct SubtitlePresentation {
    struct Cue: Equatable {
        let speaker: String
        let text: String
    }

    private(set) var displayed: Cue?
    private var latest: Cue?
    private var pending: Cue?
    private var pendingSince: TimeInterval = 0
    private var changedAt: TimeInterval = 0
    private var displayedAt: TimeInterval = 0
    private var lastSpeechAt: TimeInterval = 0

    var needsTick: Bool { pending != nil || displayed != nil }

    mutating func receive(speaker: String, text: String, at now: TimeInterval) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { self = Self(); return }
        let cue = Cue(speaker: speaker, text: text)
        // Duplicate analyzer results must not keep a finished subtitle up forever,
        // or resurrect it after silence.
        guard cue != latest else { return }
        latest = cue
        lastSpeechAt = now
        changedAt = now
        if pending == nil { pendingSince = now }
        pending = cue == displayed ? nil : cue
    }

    mutating func tick(at now: TimeInterval) {
        if now - lastSpeechAt >= 2.8 { pending = nil }
        if let next = pending {
            let collected = now - pendingSince
            // Publish the first phrase promptly, then prepare each replacement off
            // screen. The deadline also bounds latency during continuous revisions.
            let ready = collected >= 0.15 && (now - changedAt >= 0.08 || collected >= 0.25)
            let hold = displayed.map { Self.readingTime($0.text) } ?? 0
            // Reading time is a preference, not a backlog. Once newer speech has
            // waited this long, advance to its latest snapshot after a minimum hold.
            // This also handles recognition arriving in bursts without estimating
            // speaking speed from the recognizer's revision frequency.
            let catchingUp = collected >= 0.45 && now - displayedAt >= 0.6
            if ready && (displayed == nil || now - displayedAt >= hold || catchingUp) {
                displayed = next
                displayedAt = now
                pending = nil
            }
        }
        if pending == nil, displayed != nil,
           now - lastSpeechAt >= 2.8,
           now - displayedAt >= Self.readingTime(displayed!.text) {
            displayed = nil
        }
    }

    static func readingTime(_ text: String) -> TimeInterval {
        // Short phrases can advance quickly; full two-line cards still get time
        // to read. Never replace a visible cue on every recognition update.
        min(1.8, max(0.6, Double(text.count) / 46))
    }
}
