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
    /// Settles that had to cut at an arbitrary instant because the analyzer had
    /// reported no region boundary to cut on. These are where words go missing.
    var forcedSettles = 0
    /// What the analyzer had offered as region boundaries at each settle.
    var settleSamples: [String] = []
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
///
/// **One capture run, not one app launch.** `stop()` finishes both streams, and a
/// finished `AsyncStream` cannot be reopened; the frame counter, the settle mark and
/// every statistic here measure *this* run and `start()` does not reset them. A second
/// meeting therefore needs new transcribers rather than a second `start()` on these.
/// Reusing them is silent and total: every settled segment is yielded into a finished
/// stream and dropped, so the meeting saves with an empty transcript and no notes,
/// while capture, recognition and the caption all look healthy.
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
    ///
    /// A `var` so `SpeechFidelityTests` can sweep it against real audio; nothing in
    /// the app writes to it. The same goes for `forceSettleAfter` below. Both were
    /// chosen by measurement, and the measurement has to stay repeatable.
    nonisolated(unsafe) static var volatileTail: Double = 2.0
    /// Every four seconds, which is what Stage 0 measured and what produced legible
    /// text. Settling at detected pauses instead was tried and reverted: an RMS gate
    /// read ordinary speech as silence about half the time, so the cut landed inside
    /// words rather than between sentences and the transcript came back as
    /// `"Okay. . let's move the... , to."`
    private static let settleEvery: Duration = .seconds(4)

    /// The least audio that may accumulate before it is settled. See `settle()` for
    /// the measurements that chose 15 over the 4 this shipped with.
    ///
    /// The timer still ticks every `settleEvery`; this decides when a tick acts, so
    /// a cut lands as soon as its interval is up rather than on a coarser grid.
    nonisolated(unsafe) static var minimumSettleInterval: Double = 15.0

    /// Cut where the analyzer says its current region ends, rather than at an
    /// arbitrary instant inside it.
    nonisolated(unsafe) static var alignToRegionEnd = true
    private var settledThrough: Double = 0
    private var sourceOffset: CMTime = .zero
    private var haveOffset = false

    /// Settled speech, in the order it settled. A stream rather than a callback so
    /// the consumer sees promotions in order — with a callback plus a Task hop, two
    /// promotions in the same run can arrive swapped, and a transcript that reorders
    /// itself is worse than one that lags.
    nonisolated let segments: AsyncStream<Segment>
    private let emit: AsyncStream<Segment>.Continuation

    /// The speaking edge, pushed the instant a result lands. This is what a caption is
    /// for; `segments` is what a transcript is for, and arrives later by design.
    ///
    /// Buffering the newest value only, unlike `segments`. Every element here
    /// supersedes the one before it — it is a snapshot of the same live text, not a new
    /// piece of it — so a burst of results must collapse to the latest rather than
    /// queue. Losing an intermediate frame of a caption costs nothing; a caption
    /// replaying a backlog behind live speech is exactly the lag this replaced.
    nonisolated let live: AsyncStream<LiveEdge>
    private let emitLive: AsyncStream<LiveEdge>.Continuation

    /// One snapshot of the speaking edge, in this source's own local seconds.
    /// `sourceStart` rides along so the consumer can place it on the meeting clock
    /// without an actor hop back to ask.
    struct LiveEdge: Sendable, Equatable {
        var text: String
        var localEnd: Double
        var sourceStart: Double
    }

    /// Recently emitted segments, for the overlap check below.
    private var recentlyEmitted: [Segment] = []

    init(kind: SourceKind) {
        self.kind = kind
        (segments, emit) = AsyncStream<Segment>.makeStream()
        (live, emitLive) = AsyncStream<LiveEdge>.makeStream(bufferingPolicy: .bufferingNewest(1))
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
            // Only a segment that ADDS nothing is a repeat. Dropping the longer of the
            // two loses the revision: measured, `"…and get it over by Thursday"` was
            // discarded as a duplicate of `"…and get it over"`, and the deadline with
            // it. A longer overlapping segment is the recogniser having heard more.
            return Self.normalized(previous.text).contains(incoming)
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
    ///
    /// **How often this runs is the single biggest lever on transcript quality, and
    /// it was set seven times too aggressively.** Measured by `SpeechFidelityTests`
    /// over two clips of clean synthesised narration with no pause in them, three
    /// trials each — the word error rate is against the script that was spoken:
    ///
    /// | settling | clip 1 | clip 2 | words kept | cuts |
    /// |---|---|---|---|---|
    /// | any instant, every 4s (was shipped) | 26.6% | 26.5% | 101/134 · 106/127 | 10 |
    /// | region end, every 4s | 25.9% | — | 99/134 | 9 |
    /// | any instant, every 15s | 5.0% | — | 128/134 | 2 |
    /// | **region end, every 15s** | **2.0%** | **15.0%** | 132/134 · 112/127 | 2 |
    ///
    /// Every forced `finalize(through:)` truncates the analyzer's context, and the
    /// words spanning the cut are lost: *"and choose speaker view instead of gallery
    /// view"* came back as *", you, of Gallery View"*. Ten cuts in 36 seconds cost a
    /// quarter of everything said — from audio with no noise, no accent and no
    /// crosstalk in it. This is where `", ........,"` and `"I'm cooking spotlight
    /// forever"` came from; it was never SODA's accuracy.
    ///
    /// Cutting at a boundary the analyzer itself reported is the smaller effect but
    /// not a free one: at 15 seconds it took clip 1 from 5.0% to 2.0% and, more
    /// usefully, from 5/1/8 across trials to 2/2/2. Where the cut lands stops being
    /// luck.
    ///
    /// This is not the RMS gate that was tried and reverted. That guessed at silence
    /// from audio energy and was wrong about half the time; this uses the analyzer's
    /// own segmentation and guesses at nothing.
    ///
    /// The cost is latency: a settled transcript now trails live speech by up to
    /// `minimumSettleInterval`. Captions do not pay it — they are driven by `live`,
    /// pushed the instant a result lands — and `stop()` promotes everything, so no
    /// meeting ends short. A transcript that arrives late is recoverable; a
    /// transcript missing a quarter of its words is not.
    private func settle() async {
        guard let analyzer else { return }
        let fedSeconds = Double(framesFed) / feedRate
        let latest = fedSeconds - Self.volatileTail
        guard latest > settledThrough + 0.5 else { return }

        guard latest - settledThrough >= Self.minimumSettleInterval else { return }

        let offered = pending.map(\.end).sorted()
        let atRegionEnd = Self.alignToRegionEnd
            ? offered.filter { $0 > settledThrough + 0.5 && $0 <= fedSeconds }.max()
            : nil
        let through = atRegionEnd ?? latest
        if atRegionEnd == nil { stats.forcedSettles += 1 }
        if stats.settleSamples.count < 12 {
            stats.settleSamples.append(String(format: "fed %.1f settled %.1f | offered %@ -> cut %.1f%@",
                fedSeconds, settledThrough,
                offered.map { String(format: "%.1f", $0) }.joined(separator: ","),
                through, atRegionEnd == nil ? " (arbitrary)" : ""))
        }

        do {
            try await analyzer.finalize(through: CMTime(seconds: through, preferredTimescale: 1000))
            settledThrough = through
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

        publishLiveEdge()
    }

    /// The caption's whole update path: a result landed, so the edge moved.
    ///
    /// Pushed here rather than polled by the consumer. A 100ms tick added up to 100ms
    /// to every caption and, worse, put updates on a fixed grid uncorrelated with
    /// speech, so words arrived in clumps of whatever the tick happened to catch.
    private func publishLiveEdge() {
        let unsettled = pending.map { Segment(start: $0.start, end: $0.end, text: $0.text) }
        emitLive.yield(LiveEdge(
            text: CaptionEdge.card(settled: recentlyEmitted, pending: unsettled),
            localEnd: stats.lastRangeEnd,
            sourceStart: haveOffset ? sourceOffset.seconds : 0
        ))
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
        emitLive.finish()

        analyzer = nil
        transcriber = nil
    }
}
