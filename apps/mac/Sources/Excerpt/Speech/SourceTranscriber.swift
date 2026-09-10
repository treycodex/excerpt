import AVFoundation
import Speech

/// Result counters per source, plus the last text seen. Volatile and finalized are
/// tracked separately because that distinction is the whole point: volatile drives
/// the overlay, finalized becomes the transcript.
struct TranscriptStats: Sendable {
    var volatileResults = 0
    var finalizedResults = 0
    var lastVolatile = ""
    var lastFinalized = ""
    var firstResultSeconds: Double?
    var lastRangeStart: Double = 0
    var lastRangeEnd: Double = 0
    var monotonic = true
    var error: String?
    /// A few (result range, volatile range) pairs, so the volatile/finalized rule can
    /// be derived from what the analyzer actually reports rather than assumed.
    var samples: [String] = []
    var settleCalls = 0
    var finalizedSamples: [String] = []
}

/// One settled span of speech, in this source's own local seconds. The meeting
/// clock turns it into a position on the shared timeline.
struct Segment: Sendable, Equatable {
    var start: Double
    var end: Double
    var text: String
}

/// One SpeechAnalyzer + SpeechTranscriber for a single audio source.
///
/// Deliberately NOT porting the web build's six-second chunking: that works around
/// Chrome finalizing only on pauses. Apple marks volatile results explicitly and
/// supersedes them, so committing early here would commit text the recogniser may
/// still revise.
actor SourceTranscriber {
    let kind: SourceKind

    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var continuation: AsyncStream<AnalyzerInput>.Continuation?
    private var converter: AVAudioConverter?
    private var analyzerFormat: AVAudioFormat?
    private var stats = TranscriptStats()
    private var volatileRange: CMTimeRange?
    /// Latest text seen for each still-unsettled region, keyed by range start.
    ///
    /// A result for a region arrives BEFORE the volatile-window update that settles
    /// it, so finality cannot be judged when the result appears — measured directly:
    /// "res 0.00–1.14 | vol 0.00–2.24" was the final text for 0–1.14, proven only
    /// when the window moved to 1.14–2.24 immediately afterwards.
    private var pending: [(start: Double, end: Double, text: String)] = []
    private var startedAt: Date?
    private var resultsTask: Task<Void, Never>?

    /// Frames handed to the analyzer, counted in the ANALYZER's format.
    ///
    /// Timestamps must be derived from this, not from the capture buffer's
    /// presentation time: after sample-rate conversion the frame count changes, so
    /// capture-clock timestamps overlap and the analyzer rejects the input with
    /// "Audio input timestamp overlaps or precedes prior audio input".
    private var framesFed: Int64 = 0
    private var feedRate: Double = 16_000
    private var finalizeTask: Task<Void, Never>?
    /// Seconds of trailing audio left volatile, so the overlay still has live text
    /// while everything older is settled.
    private static let volatileTail: Double = 2.0
    private static let settleEvery: Duration = .seconds(4)
    private var sourceOffset: CMTime = .zero
    private var haveOffset = false

    /// Settled speech, in the order it settled. A stream rather than a callback so
    /// the consumer sees promotions in order — with a callback plus a Task hop, two
    /// promotions in the same run can arrive swapped, and a transcript that reorders
    /// itself is worse than one that lags.
    nonisolated let segments: AsyncStream<Segment>
    private let emit: AsyncStream<Segment>.Continuation

    /// Recently emitted segments, for the overlap check below.
    private var recentlyEmitted: [Segment] = []

    init(kind: SourceKind) {
        self.kind = kind
        (segments, emit) = AsyncStream<Segment>.makeStream()
    }

    func statistics() -> TranscriptStats { stats }

    func start() async throws {
        let transcriber = SpeechTranscriber(
            locale: Locale(identifier: "en-US"),
            preset: .timeIndexedProgressiveTranscription
        )
        self.transcriber = transcriber

        analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])

        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = continuation

        let analyzer = SpeechAnalyzer(
            inputSequence: stream,
            modules: [transcriber],
            volatileRangeChangedHandler: { [weak self] range, _, _ in
                Task { await self?.setVolatileRange(range) }
            }
        )
        self.analyzer = analyzer
        startedAt = Date()

        // The analyzer will hold a growing volatile region indefinitely on continuous
        // speech — measured: a 20-second window that never advanced. Asking it to
        // settle everything older than a short tail is what turns speech into a
        // transcript. Unlike the web build's guess-when-text-stops-changing hack,
        // the framework does the settling and reports it.
        finalizeTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: Self.settleEvery)
                await self?.settle()
            }
        }

        resultsTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await result in transcriber.results {
                    await self.record(result)
                }
            } catch {
                await self.record(error: "\(error)")
            }
        }
    }

    private func setVolatileRange(_ range: CMTimeRange) {
        volatileRange = range
        promote(settledBefore: range.start.seconds)
    }

    /// Anything the volatile window has moved past is settled transcript.
    private func promote(settledBefore boundary: Double) {
        guard boundary > 0 else { return }
        let settled = pending.filter { $0.end <= boundary + 0.001 }
        guard !settled.isEmpty else { return }
        pending.removeAll { $0.end <= boundary + 0.001 }
        for item in settled.sorted(by: { $0.start < $1.start }) {
            let segment = Segment(start: item.start, end: item.end, text: item.text)
            guard Self.carriesContent(segment.text), !isRepeat(of: segment) else { continue }

            recentlyEmitted.append(segment)
            if recentlyEmitted.count > 4 { recentlyEmitted.removeFirst() }

            stats.finalizedResults += 1
            stats.lastFinalized = segment.text
            if stats.finalizedSamples.count < 6 {
                stats.finalizedSamples.append(String(format: "%.2f–%.2f “%@”", segment.start, segment.end, segment.text.suffix(50).description))
            }
            emit.yield(segment)
        }
    }

    /// Measured in Stage 0: overlapping promotions produce near-duplicate segments —
    /// `4.02–8.38 "For his 1st act"` followed by `7.02–8.38 "For his 1st act."`. The
    /// same words, settled twice, because two promotions covered overlapping audio.
    /// Time alone cannot decide it and text alone cannot either; overlapping *and*
    /// one text containing the other is what makes it a revision rather than a repeat
    /// of a genuinely repeated phrase.
    private func isRepeat(of segment: Segment) -> Bool {
        let incoming = Self.normalized(segment.text)
        guard !incoming.isEmpty else { return true }

        return recentlyEmitted.contains { previous in
            let overlap = min(previous.end, segment.end) - max(previous.start, segment.start)
            guard overlap > 0 else { return false }
            let existing = Self.normalized(previous.text)
            return existing.contains(incoming) || incoming.contains(existing)
        }
    }

    /// Measured in Stage 0: some settled segments are punctuation only — `"."`, `".."`.
    /// A transcript row saying nothing is worse than no row.
    private static func carriesContent(_ text: String) -> Bool {
        text.contains { $0.isLetter || $0.isNumber }
    }

    private static func normalized(_ text: String) -> String {
        text.lowercased().filter { $0.isLetter || $0.isNumber || $0 == " " }
            .trimmingCharacters(in: .whitespaces)
    }

    /// Finalize everything except a short trailing window.
    private func settle() async {
        guard let analyzer else { return }
        let fedSeconds = Double(framesFed) / feedRate
        let through = fedSeconds - Self.volatileTail
        guard through > 0 else { return }
        do {
            try await analyzer.finalize(through: CMTime(seconds: through, preferredTimescale: 1000))
            stats.settleCalls += 1
        } catch {
            record(error: "finalize: \(error)")
        }
    }

    private func record(error: String) {
        guard stats.error == nil else { return }   // first failure is the useful one
        stats.error = error
    }

    private func record(_ result: SpeechTranscriber.Result) {
        let text = String(result.text.characters)
        guard !text.isEmpty else { return }

        if stats.firstResultSeconds == nil, let startedAt {
            stats.firstResultSeconds = Date().timeIntervalSince(startedAt)
        }

        // A result is still volatile while it sits inside the analyzer's volatile
        // range; once that range has moved past it, the text is settled.
        // Settled means the volatile window has advanced past this result.
        let isVolatile: Bool = {
            guard let volatileRange else { return false }
            return result.range.end > volatileRange.start + CMTime(value: 1, timescale: 1000)
        }()

        if stats.samples.count < 8 {
            let v = volatileRange.map { String(format: "vol %.2f–%.2f", $0.start.seconds, $0.end.seconds) } ?? "vol nil"
            stats.samples.append(String(format: "res %.2f–%.2f | %@ | %@ | “%@”",
                                        result.range.start.seconds, result.range.end.seconds,
                                        v, isVolatile ? "VOLATILE" : "final", text.suffix(40).description))
        }

        let start = result.range.start.seconds
        let end = result.range.end.seconds
        if start.isFinite, end.isFinite {
            if start + 0.001 < stats.lastRangeStart { stats.monotonic = false }
            stats.lastRangeStart = start
            stats.lastRangeEnd = end
        }

        // Always record as volatile-in-progress; promotion happens when the window
        // advances past it.
        stats.volatileResults += 1
        stats.lastVolatile = text
        _ = isVolatile

        if let index = pending.firstIndex(where: { abs($0.start - start) < 0.001 }) {
            pending[index] = (start, end, text)
        } else {
            pending.append((start, end, text))
        }
        if pending.count > 64 { pending.removeFirst(pending.count - 64) }
    }

    /// Feeds one captured buffer, converting to whatever format the analyzer wants.
    func feed(_ buffer: AVAudioPCMBuffer, at time: CMTime) {
        guard let continuation else { return }
        guard let converted = convert(buffer) else { return }

        // Remember where this source began on the capture clock, so its results can
        // still be placed on the shared meeting timeline (gate 8).
        if !haveOffset { sourceOffset = time; haveOffset = true }

        let rate = converted.format.sampleRate
        feedRate = rate
        let start = CMTime(value: framesFed, timescale: CMTimeScale(rate))
        framesFed += Int64(converted.frameLength)

        continuation.yield(AnalyzerInput(buffer: converted, bufferStartTime: start))
    }

    /// Offset of this source's zero against the capture clock.
    func captureOffsetSeconds() -> Double { haveOffset ? sourceOffset.seconds : 0 }

    private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let target = analyzerFormat else { return buffer }
        if buffer.format == target { return buffer }

        if converter == nil || converter?.inputFormat != buffer.format {
            converter = AVAudioConverter(from: buffer.format, to: target)
        }
        guard let converter else { return nil }

        let ratio = target.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 1024)
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return nil }

        var supplied = false
        var conversionError: NSError?
        converter.convert(to: output, error: &conversionError) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true
            status.pointee = .haveData
            return buffer
        }
        if conversionError != nil { return nil }
        return output.frameLength > 0 ? output : nil
    }

    /// Finalizes cleanly so trailing speech is not lost — gate 12's "no silent loss".
    func stop() async {
        continuation?.finish()
        continuation = nil

        // finalizeAndFinishThroughEndOfInput emits the trailing finalized results.
        // Cancelling the results task straight afterwards raced them away, which is
        // gate 12's "no silent transcript loss" in miniature.
        finalizeTask?.cancel()
        finalizeTask = nil
        try? await analyzer?.finalizeAndFinishThroughEndOfInput()

        if let task = resultsTask {
            let drained: Void? = try? await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { await task.value }
                group.addTask { try await Task.sleep(nanoseconds: 3_000_000_000) }
                try await group.next()
                group.cancelAll()
            }
            _ = drained
        }
        resultsTask = nil

        // Gate 12: the tail must not vanish just because the session ended.
        promote(settledBefore: .greatestFiniteMagnitude)
        emit.finish()

        analyzer = nil
        transcriber = nil
    }
}
