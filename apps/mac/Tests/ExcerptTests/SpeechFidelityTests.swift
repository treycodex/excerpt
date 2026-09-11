import AVFoundation
import Foundation
import Testing
@testable import Excerpt

/// Recognition quality over continuous narration, measured rather than assumed.
///
/// Every earlier number on this app came from a 13-second script spoken through the
/// speakers with pauses in it. Continuous speech is the case that goes wrong — the
/// analyzer never settles by itself, so `SourceTranscriber` forces it on a timer —
/// and nothing measured it until a real training video came back as
/// `", ........,"` and `"I'm cooking spotlight forever"`.
///
/// Gated: it feeds audio in real time, so it costs its clip's length to run.
///
///   EXCERPT_SPEECH_AUDIO=/path/to/clip.aiff \
///   EXCERPT_SPEECH_EXPECTED=/path/to/script.txt swift test --filter SpeechFidelity
struct SpeechFidelityTests {

    static var audioPath: String? { ProcessInfo.processInfo.environment["EXCERPT_SPEECH_AUDIO"] }

    /// Word error rate against the script that was spoken, by Levenshtein over words.
    static func wordErrorRate(heard: String, said: String) -> Double {
        let a = words(said), b = words(heard)
        guard !a.isEmpty else { return 0 }
        var previous = Array(0...b.count)
        for i in 1...a.count {
            var current = [i] + [Int](repeating: 0, count: b.count)
            for j in 1...b.count {
                current[j] = a[i - 1] == b[j - 1]
                    ? previous[j - 1]
                    : 1 + min(previous[j], current[j - 1], previous[j - 1])
            }
            previous = current
        }
        return Double(previous[b.count]) / Double(a.count)
    }

    static func words(_ text: String) -> [String] {
        text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }

    /// Runs of punctuation and filler with no word in them — the visible signature of
    /// a cut that landed inside a word: ", ........," and ", you.".
    static func debris(_ text: String) -> Int {
        var count = 0
        var search = text.startIndex..<text.endIndex
        while let found = text.range(of: #"[,.]\s*[.…]{2,}|\s,\s*[,.]"#,
                                     options: .regularExpression, range: search) {
            count += 1
            search = found.upperBound..<text.endIndex
        }
        return count
    }

    struct Setting {
        var name: String
        var interval: Double
        var align: Bool
    }

    /// One run of one setting, in real time.
    static func measure(_ setting: Setting, audio: URL, said: String) async throws -> (wer: Double, words: Int, settles: Int, forced: Int, debris: Int, text: String, samples: [String]) {
        SourceTranscriber.minimumSettleInterval = setting.interval
        SourceTranscriber.alignToRegionEnd = setting.align
        // Whatever happens below, the next suite must see the shipping defaults.
        defer { SourceTranscriber.minimumSettleInterval = 15.0; SourceTranscriber.alignToRegionEnd = true }

        let file = try AVAudioFile(forReading: audio)
        let transcriber = SourceTranscriber(kind: .system)
        let collector = Task { () -> [Segment] in
            var collected: [Segment] = []
            for await segment in transcriber.segments { collected.append(segment) }
            return collected
        }
        try await transcriber.start()

        // Real time, in the chunk size ScreenCaptureKit delivers. Feeding as fast as
        // the file reads would hand the analyzer the whole clip before the first
        // settle, which is the one thing that never happens in a meeting.
        let chunk = Int64(file.processingFormat.sampleRate / 10)
        var fed: Int64 = 0
        while file.framePosition < file.length {
            let count = AVAudioFrameCount(min(chunk, file.length - file.framePosition))
            guard count > 0,
                  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count)
            else { break }
            try file.read(into: buffer, frameCount: count)
            guard buffer.frameLength > 0 else { break }
            await transcriber.feed(buffer, at: CMTime(value: fed, timescale: CMTimeScale(file.processingFormat.sampleRate)))
            fed += Int64(buffer.frameLength)
            try await Task.sleep(for: .milliseconds(100))
        }
        await transcriber.stop()
        let settled = await collector.value
        let stats = await transcriber.statistics()
        let heard = settled.sorted { $0.start < $1.start }.map(\.text).joined(separator: " ")
        return (wordErrorRate(heard: heard, said: said), words(heard).count,
                stats.settleCalls, stats.forcedSettles, debris(heard), heard, stats.settleSamples)
    }

    /// The sweep. Costs the clip's length per run, so it is gated and run by hand.
    ///
    ///   EXCERPT_SPEECH_SWEEP=2 EXCERPT_SPEECH_AUDIO=… EXCERPT_SPEECH_EXPECTED=… \
    ///     swift test --filter SpeechFidelity
    @Test(.enabled(if: audioPath != nil && ProcessInfo.processInfo.environment["EXCERPT_SPEECH_SWEEP"] != nil))
    func `how settling changes what survives continuous narration`() async throws {
        let trials = Int(ProcessInfo.processInfo.environment["EXCERPT_SPEECH_SWEEP"] ?? "2") ?? 2
        let audio = URL(filePath: Self.audioPath!)
        let said = try String(contentsOf: URL(filePath:
            ProcessInfo.processInfo.environment["EXCERPT_SPEECH_EXPECTED"]!), encoding: .utf8)
        let spoken = Self.words(said).count

        let settings = [
            Setting(name: "any instant, every 4s (was shipped)", interval: 0, align: false),
            Setting(name: "region end, every 4s",                interval: 0, align: true),
            Setting(name: "any instant, every 15s",              interval: 15, align: false),
            Setting(name: "region end, every 15s (shipping)",    interval: 15, align: true),
        ]
        print("SPEECH SWEEP — \(spoken) words spoken, \(trials) trials each")
        for setting in settings {
            var rates: [Double] = []
            var kept: [Int] = []
            var settles: [Int] = []
            var junk: [Int] = []
            var last = ""
            for _ in 0..<trials {
                let run = try await Self.measure(setting, audio: audio, said: said)
                rates.append(run.wer); kept.append(run.words); settles.append(run.settles)
                junk.append(run.debris); last = run.text
            }
            let mean = rates.reduce(0, +) / Double(rates.count)
            print(String(format: "  %-32@ WER %.1f%% (%@)  words %@/%d  settles %@  debris %@",
                setting.name as NSString, mean * 100,
                rates.map { String(format: "%.0f", $0 * 100) }.joined(separator: "/") as NSString,
                kept.map(String.init).joined(separator: "/") as NSString, spoken,
                settles.map(String.init).joined(separator: "/") as NSString,
                junk.map(String.init).joined(separator: "/") as NSString))
            print("      last: \(last.prefix(240))")
        }
    }
}
