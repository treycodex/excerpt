import Foundation

/// What one capture source is doing, as a single word.
///
/// The Swift half of a rule shared with the web build. `packages/core/src/capture/
/// health.ts` holds the same decision and the same thresholds, and both are checked
/// against `packages/core/fixtures/source-health.json` — the browser hears through
/// Web Speech and this app through `SpeechAnalyzer`, but the two questions a person
/// needs answered are identical, and answering them differently would be two
/// products.
enum SourceHealth: String, Sendable {
    case starting
    case hearing
    case silent
    case stalled
    case failed
}

/// Everything the decision needs, in terms any capture backend can report.
struct SourceSignals: Sendable {
    var started: Bool
    var failed: Bool
    var secondsSinceVoiced: Double
    var secondsSinceFinal: Double
    var voicedSecondsSinceFinal: Double
}

extension SourceHealth {
    /// How recently a source must have heard a voice to count as hearing one.
    static let hearingWindowSeconds: Double = 4
    /// Voiced audio that must go unrecognised before a source is called stalled.
    static let stallVoicedSeconds: Double = 8
    /// And how long in wall time, so an ordinary pause never trips it.
    static let stallWallSeconds: Double = 30

    /// Both stall conditions are needed. Wall time alone calls a quiet room broken;
    /// voiced seconds alone trips on the gap between a long sentence and its final.
    ///
    /// The test is rolling rather than "has this source ever produced a result":
    /// recognition that works for ten minutes and then dies satisfies "ever" for the
    /// rest of the meeting, which is how a capture goes on saying it is listening
    /// while nothing is being written down.
    static func of(_ signals: SourceSignals) -> SourceHealth {
        if signals.failed { return .failed }
        if !signals.started { return .starting }
        if signals.voicedSecondsSinceFinal >= stallVoicedSeconds
            && signals.secondsSinceFinal >= stallWallSeconds { return .stalled }
        return signals.secondsSinceVoiced <= hearingWindowSeconds ? .hearing : .silent
    }

    /// One line a person can act on, or nothing when the source is fine.
    ///
    /// `silent` is not a fault and never produces a line: a microphone nobody is
    /// talking into is the normal state of a microphone for most of a meeting, and
    /// warning about it trains people to ignore the line that carries the real
    /// problem.
    func concern(for name: String) -> String? {
        switch self {
        case .stalled: return "\(name) is picking up sound, but nothing is being recognised."
        case .failed:  return "\(name) has stopped working. Your notes so far are safe."
        default:       return nil
        }
    }
}

/// Derives the signals from the counters capture and speech already keep.
///
/// Nothing new is measured. `CaptureEngine` already accumulates `voicedSeconds` per
/// source and `SourceTranscriber` already counts finalized results; both were only
/// ever read once, at the end of the meeting, to compose a diagnostic line nobody
/// sees until it is too late to act on. Ticking them turns the same numbers into a
/// question that can be answered while the meeting is still running.
///
/// `voicedSeconds` is cumulative and never decays, so it can only say whether a
/// source *ever* heard anything. What a live indicator has to answer is whether it
/// is hearing anything *now*, which is why this remembers when the counters last
/// moved rather than reading their totals.
struct SourceHealthMonitor: Sendable {
    private var lastVoicedAt: Date?
    private var lastFinalAt: Date?
    private var voicedSecondsAtLastFinal: Double = 0
    private var lastVoicedSeconds: Double = 0
    private var lastFinalizedResults = 0
    private var started = false

    /// Fold one reading of the counters in, and say what this source is doing.
    ///
    /// - Parameter now: injected so the rule can be tested without waiting.
    mutating func update(
        audio: SourceStats, speech: TranscriptStats, now: Date = Date()
    ) -> SourceHealth {
        if speech.volatileResults > 0 || speech.finalizedResults > 0 { started = true }

        if audio.voicedSeconds > lastVoicedSeconds {
            lastVoicedAt = now
            lastVoicedSeconds = audio.voicedSeconds
        }

        if speech.finalizedResults > lastFinalizedResults {
            lastFinalizedResults = speech.finalizedResults
            lastFinalAt = now
            voicedSecondsAtLastFinal = audio.voicedSeconds
        }

        // Until the first final, "since the last final" is measured from the first
        // sound — otherwise a source that has never recognised anything would look
        // stalled from the moment capture began.
        let sinceFinal = lastFinalAt.map { now.timeIntervalSince($0) }
            ?? lastVoicedAt.map { now.timeIntervalSince($0) } ?? 0

        return SourceHealth.of(SourceSignals(
            started: started,
            failed: speech.error != nil || audio.lastError != nil,
            // No voice yet is not "heard a moment ago": a source that has never
            // carried sound must never read as hearing one.
            secondsSinceVoiced: lastVoicedAt.map { now.timeIntervalSince($0) } ?? .greatestFiniteMagnitude,
            secondsSinceFinal: sinceFinal,
            voicedSecondsSinceFinal: audio.voicedSeconds - voicedSecondsAtLastFinal))
    }
}
