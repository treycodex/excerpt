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

    /// LibriSpeech spells numbers out and `SpeechTranscriber` writes digits, so
    /// "or 2 perhaps" against OR TWO PERHAPS is a notation difference, not an error.
    /// Normalising both sides is standard practice for a reported WER.
    static let numberWords = ["0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
        "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
        "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen",
        "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen", "20": "twenty",
        "30": "thirty", "40": "forty", "50": "fifty", "60": "sixty", "70": "seventy",
        "80": "eighty", "90": "ninety", "100": "hundred", "1000": "thousand"]

    static func words(_ text: String) -> [String] {
        text.lowercased().split { !$0.isLetter && !$0.isNumber }
            .map { numberWords[String($0)] ?? String($0) }
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

    // MARK: - LibriSpeech

    /// One reference utterance: real human speech with a human-written transcript.
    struct Utterance {
        var audio: URL
        var said: String
        var seconds: Double
    }

    /// Reads a LibriSpeech split — `<speaker>/<chapter>/<chapter>.trans.txt` naming
    /// one transcript per line, with the matching `.flac` beside it.
    ///
    /// Utterances are taken in sorted order so a run is repeatable, and across as many
    /// speakers as the budget reaches rather than all from one voice.
    static func libriSpeech(at root: URL, seconds budget: Double) throws -> [Utterance] {
        let manager = FileManager.default
        var transcripts: [URL] = []
        if let walk = manager.enumerator(at: root, includingPropertiesForKeys: nil) {
            for case let url as URL in walk where url.lastPathComponent.hasSuffix(".trans.txt") {
                transcripts.append(url)
            }
        }
        var perChapter: [[Utterance]] = []
        for transcript in transcripts.sorted(by: { $0.path < $1.path }) {
            var chapter: [Utterance] = []
            for line in try String(contentsOf: transcript, encoding: .utf8).split(separator: "\n") {
                guard let space = line.firstIndex(of: " ") else { continue }
                let audio = transcript.deletingLastPathComponent()
                    .appending(path: "\(line[line.startIndex..<space]).flac")
                guard manager.fileExists(atPath: audio.path),
                      let file = try? AVAudioFile(forReading: audio) else { continue }
                chapter.append(Utterance(audio: audio, said: String(line[line.index(after: space)...]),
                                         seconds: Double(file.length) / file.processingFormat.sampleRate))
            }
            perChapter.append(chapter)
        }
        // Round-robin the chapters, so a five-minute sample is many voices rather than
        // one reader who happens to be easy or hard.
        var picked: [Utterance] = []
        var total = 0.0
        var index = 0
        while total < budget, perChapter.contains(where: { index < $0.count }) {
            for chapter in perChapter where index < chapter.count {
                let utterance = chapter[index]
                picked.append(utterance)
                total += utterance.seconds
                if total >= budget { break }
            }
            index += 1
        }
        return picked
    }

    /// Feeds a whole corpus through one transcriber as a single continuous stream,
    /// which is what a meeting is and what a list of separate clips is not.
    static func measureCorpus(_ setting: Setting, _ utterances: [Utterance], realTime: Bool)
        async throws -> (wer: Double, heardWords: Int, saidWords: Int, settles: Int, forced: Int, seconds: Double)
    {
        SourceTranscriber.minimumSettleInterval = setting.interval
        SourceTranscriber.alignToRegionEnd = setting.align
        defer { SourceTranscriber.minimumSettleInterval = 15.0; SourceTranscriber.alignToRegionEnd = true }

        let transcriber = SourceTranscriber(kind: .system)
        let collector = Task { () -> [Segment] in
            var collected: [Segment] = []
            for await segment in transcriber.segments { collected.append(segment) }
            return collected
        }
        try await transcriber.start()

        var fed: Int64 = 0
        var rate: Double = 16_000
        var spoken = 0.0
        for utterance in utterances {
            let file = try AVAudioFile(forReading: utterance.audio)
            rate = file.processingFormat.sampleRate
            spoken += utterance.seconds
            let chunk = Int64(rate / 10)
            while file.framePosition < file.length {
                let count = AVAudioFrameCount(min(chunk, file.length - file.framePosition))
                guard count > 0,
                      let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count)
                else { break }
                try file.read(into: buffer, frameCount: count)
                guard buffer.frameLength > 0 else { break }
                await transcriber.feed(buffer, at: CMTime(value: fed, timescale: CMTimeScale(rate)))
                fed += Int64(buffer.frameLength)
                if realTime { try await Task.sleep(for: .milliseconds(100)) }
            }
        }
        await transcriber.stop()
        let settled = await collector.value
        let stats = await transcriber.statistics()
        // Through assembly, because that is what `MeetingSession` saves and what a
        // person reads. Scoring the transcriber's raw output measured a stage nobody
        // sees, and counted as errors the duplicate promotions that `assemble` exists
        // to splice — 111 words against 98 spoken, the same line twice.
        let events = TranscriptAssembly.assemble(settled.enumerated().map { index, segment in
            TranscriptEvent(id: "s\(index)", sessionId: "libri", role: .remote, speakerLabel: "SPEAKER",
                            text: segment.text, isFinal: true, tArrived: segment.start * 1000,
                            tStart: segment.start, tEnd: segment.end)
        })
        let heard = events.map(\.text).joined(separator: " ")
        let said = utterances.map(\.said).joined(separator: " ")
        // Raw against assembled from the SAME run, because the transcriber's own
        // output varies between runs and two separate runs cannot tell whether
        // assembly helped or hurt.
        let raw = settled.sorted { $0.start < $1.start }.map(\.text).joined(separator: " ")
        print(String(format: "      raw %5.1f%% (%d words) -> assembled %5.1f%% (%d words), %d segments -> %d events",
                     wordErrorRate(heard: raw, said: said) * 100, words(raw).count,
                     wordErrorRate(heard: heard, said: said) * 100, words(heard).count,
                     settled.count, events.count))
        if ProcessInfo.processInfo.environment["EXCERPT_LIBRI_DUMP"] != nil {
            print("    SAID:  \(said.prefix(700))")
            print("    HEARD: \(heard.prefix(700))")
        }
        return (wordErrorRate(heard: heard, said: said), words(heard).count, words(said).count,
                stats.settleCalls, stats.forcedSettles, spoken)
    }

    /// One utterance, one transcriber, no concatenation and no settling — the protocol
    /// every published LibriSpeech number uses.
    ///
    /// The concatenated runs cannot answer "how good is the model", because feeding a
    /// whole split at once leaves duplicate promotions that inflate the word count by
    /// about 15%. This is the only figure here comparable to a vendor's.
    static func measurePerUtterance(_ utterances: [Utterance]) async throws -> (wer: Double, heard: Int, said: Int) {
        var heardAll: [String] = []
        var saidAll: [String] = []
        for utterance in utterances {
            let transcriber = SourceTranscriber(kind: .system)
            let collector = Task { () -> [Segment] in
                var collected: [Segment] = []
                for await segment in transcriber.segments { collected.append(segment) }
                return collected
            }
            try await transcriber.start()
            let file = try AVAudioFile(forReading: utterance.audio)
            let rate = file.processingFormat.sampleRate
            var fed: Int64 = 0
            let chunk = Int64(rate / 10)
            while file.framePosition < file.length {
                let count = AVAudioFrameCount(min(chunk, file.length - file.framePosition))
                guard count > 0,
                      let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count)
                else { break }
                try file.read(into: buffer, frameCount: count)
                guard buffer.frameLength > 0 else { break }
                await transcriber.feed(buffer, at: CMTime(value: fed, timescale: CMTimeScale(rate)))
                fed += Int64(buffer.frameLength)
            }
            await transcriber.stop()
            let settled = await collector.value
            heardAll.append(settled.sorted { $0.start < $1.start }.map(\.text).joined(separator: " "))
            saidAll.append(utterance.said)
        }
        let heard = heardAll.joined(separator: " "), said = saidAll.joined(separator: " ")
        return (wordErrorRate(heard: heard, said: said), words(heard).count, words(said).count)
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["EXCERPT_LIBRI_PERUTTERANCE"] != nil))
    func `how good is the model itself`() async throws {
        let root = URL(filePath: ProcessInfo.processInfo.environment["EXCERPT_LIBRISPEECH"]!)
        for split in ["test-clean", "test-other"] {
            let directory = root.appending(path: split)
            guard FileManager.default.fileExists(atPath: directory.path) else { continue }
            let utterances = try Self.libriSpeech(at: directory, seconds: 300)
            let run = try await Self.measurePerUtterance(utterances)
            print(String(format: "PER-UTTERANCE %@ — WER %.1f%%   words %d/%d   (%d utterances)",
                         split as NSString, run.wer * 100, run.heard, run.said, utterances.count))
        }
    }

    /// The baseline this project never had: real human speech, human transcripts.
    ///
    ///   EXCERPT_LIBRISPEECH=…/LibriSpeech swift test --filter SpeechFidelity
    @Test(.enabled(if: ProcessInfo.processInfo.environment["EXCERPT_LIBRISPEECH"] != nil))
    func `what the pipeline does to real speech`() async throws {
        let root = URL(filePath: ProcessInfo.processInfo.environment["EXCERPT_LIBRISPEECH"]!)
        let budget = Double(ProcessInfo.processInfo.environment["EXCERPT_LIBRI_SECONDS"] ?? "300") ?? 300
        let shipping = Setting(name: "shipping", interval: 15, align: true)
        let asShipped = Setting(name: "old 4s timer", interval: 0, align: false)

        for split in ["test-clean", "test-other"] {
            let directory = root.appending(path: split)
            guard FileManager.default.fileExists(atPath: directory.path) else { continue }
            let utterances = try Self.libriSpeech(at: directory, seconds: budget)
            print("LIBRISPEECH \(split) — \(utterances.count) utterances, \(String(format: "%.1f", utterances.map(\.seconds).reduce(0, +) / 60)) min")

            // Fast first: it costs seconds, and it is the ceiling the real-time runs
            // are measured against — the model's accuracy with settling barely in play.
            for (mode, realTime) in [("fed fast ", false), ("real time", true)] {
                for setting in (realTime ? [asShipped, shipping] : [shipping]) {
                    let run = try await Self.measureCorpus(setting, utterances, realTime: realTime)
                    print(String(format: "  %@  %-13@ WER %5.1f%%   words %d/%d   settles %d (%d arbitrary)",
                                 mode as NSString, setting.name as NSString, run.wer * 100,
                                 run.heardWords, run.saidWords, run.settles, run.forced))
                }
            }
        }
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
