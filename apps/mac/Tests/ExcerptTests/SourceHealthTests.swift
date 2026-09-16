import Foundation
import Testing
@testable import Excerpt

/// The Swift half of the source-health parity harness.
///
/// `packages/core/fixtures/source-health.json` is read by vitest against
/// `healthOf` in `packages/core/src/capture/health.ts` and here against
/// `SourceHealth.of`. The browser hears through Web Speech and this app through
/// `SpeechAnalyzer`; a person must not be told two different things about one
/// meeting, and the only way to keep that true is to check one table twice.
@Suite struct SourceHealthTests {

    private struct Fixtures: Decodable {
        struct Case: Decodable {
            let name: String
            let signals: Signals
            let expect: String
        }
        struct Signals: Decodable {
            let started: Bool
            let failed: Bool
            let secondsSinceVoiced: Double
            let secondsSinceFinal: Double
            let voicedSecondsSinceFinal: Double
        }
        let cases: [Case]
    }

    private static var repoRoot: URL {
        URL(filePath: #filePath)                    // …/Tests/ExcerptTests/SourceHealthTests.swift
            .deletingLastPathComponent()            // ExcerptTests
            .deletingLastPathComponent()            // Tests
            .deletingLastPathComponent()            // mac
            .deletingLastPathComponent()            // apps
            .deletingLastPathComponent()            // excerpt
    }

    @Test func `every source-health fixture agrees with the TypeScript rule`() throws {
        let url = Self.repoRoot.appending(path: "packages/core/fixtures/source-health.json")
        let fixtures = try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
        #expect(!fixtures.cases.isEmpty)

        for testCase in fixtures.cases {
            let health = SourceHealth.of(SourceSignals(
                started: testCase.signals.started,
                failed: testCase.signals.failed,
                secondsSinceVoiced: testCase.signals.secondsSinceVoiced,
                secondsSinceFinal: testCase.signals.secondsSinceFinal,
                voicedSecondsSinceFinal: testCase.signals.voicedSecondsSinceFinal))
            #expect(health.rawValue == testCase.expect, "\(testCase.name)")
        }
    }

    @Test func `the thresholds match the ones the web build uses`() throws {
        // A drifting constant would pass every fixture above and still describe one
        // meeting two ways, so the numbers are asserted directly.
        let source = try String(
            contentsOf: Self.repoRoot.appending(path: "packages/core/src/capture/health.ts"),
            encoding: .utf8)
        #expect(source.contains("HEARING_WINDOW_SECONDS = \(Int(SourceHealth.hearingWindowSeconds))"))
        #expect(source.contains("STALL_VOICED_SECONDS = \(Int(SourceHealth.stallVoicedSeconds))"))
        #expect(source.contains("STALL_WALL_SECONDS = \(Int(SourceHealth.stallWallSeconds))"))
    }
}

/// The monitor that turns counters this app already kept into a live answer.
@Suite struct SourceHealthMonitorTests {

    private func audio(voiced: Double, error: String? = nil) -> SourceStats {
        var stats = SourceStats()
        stats.voicedSeconds = voiced
        stats.lastError = error
        return stats
    }

    private func speech(finals: Int, volatiles: Int = 1, error: String? = nil) -> TranscriptStats {
        var stats = TranscriptStats()
        stats.finalizedResults = finals
        stats.volatileResults = volatiles
        stats.error = error
        return stats
    }

    @Test func `a source nobody has spoken into yet never reads as hearing one`() {
        // voicedSeconds is cumulative, so "has it ever heard anything" is the wrong
        // question; before any sound the answer must not be "hearing".
        var monitor = SourceHealthMonitor()
        let health = monitor.update(audio: audio(voiced: 0), speech: speech(finals: 0, volatiles: 0))
        #expect(health == .starting)
    }

    @Test func `speech arriving and being recognised reads as hearing`() {
        var monitor = SourceHealthMonitor()
        let start = Date()
        _ = monitor.update(audio: audio(voiced: 1), speech: speech(finals: 1), now: start)
        let health = monitor.update(
            audio: audio(voiced: 3), speech: speech(finals: 2), now: start.addingTimeInterval(2))
        #expect(health == .hearing)
    }

    @Test func `a recogniser that dies mid-meeting is caught`() {
        // The case this whole file exists for: ten minutes of working recognition,
        // then nothing, while sound keeps arriving.
        var monitor = SourceHealthMonitor()
        let start = Date()
        _ = monitor.update(audio: audio(voiced: 300), speech: speech(finals: 40), now: start)

        // Finals stop. Voiced audio keeps climbing.
        var health = SourceHealth.hearing
        for step in 1...12 {
            health = monitor.update(
                audio: audio(voiced: 300 + Double(step) * 5),
                speech: speech(finals: 40),
                now: start.addingTimeInterval(Double(step) * 5))
        }
        #expect(health == .stalled)
    }

    @Test func `a long quiet stretch is not mistaken for a dead recogniser`() {
        // Nobody speaks for five minutes. Nothing is wrong, and saying otherwise
        // trains people to ignore the warning that matters.
        var monitor = SourceHealthMonitor()
        let start = Date()
        _ = monitor.update(audio: audio(voiced: 120), speech: speech(finals: 20), now: start)
        let health = monitor.update(
            audio: audio(voiced: 120), speech: speech(finals: 20), now: start.addingTimeInterval(300))
        #expect(health == .silent)
    }

    @Test func `recovering after a stall reports hearing again`() {
        var monitor = SourceHealthMonitor()
        let start = Date()
        _ = monitor.update(audio: audio(voiced: 100), speech: speech(finals: 10), now: start)
        var health = SourceHealth.hearing
        for step in 1...12 {
            health = monitor.update(
                audio: audio(voiced: 100 + Double(step) * 5), speech: speech(finals: 10),
                now: start.addingTimeInterval(Double(step) * 5))
        }
        #expect(health == .stalled)

        health = monitor.update(
            audio: audio(voiced: 165), speech: speech(finals: 11),
            now: start.addingTimeInterval(65))
        #expect(health == .hearing)
    }

    @Test func `an errored source is failed whatever the counters say`() {
        var monitor = SourceHealthMonitor()
        let health = monitor.update(
            audio: audio(voiced: 50), speech: speech(finals: 5, error: "analyzer stopped"))
        #expect(health == .failed)
    }

    @Test func `a capture error counts too, not only a speech one`() {
        var monitor = SourceHealthMonitor()
        let health = monitor.update(
            audio: audio(voiced: 50, error: "device disappeared"), speech: speech(finals: 5))
        #expect(health == .failed)
    }

    @Test func `only the faults are worth interrupting somebody for`() {
        #expect(SourceHealth.silent.concern(for: "Your microphone") == nil)
        #expect(SourceHealth.hearing.concern(for: "Your microphone") == nil)
        #expect(SourceHealth.starting.concern(for: "Your microphone") == nil)
        #expect(SourceHealth.stalled.concern(for: "Meeting audio")?.contains("Meeting audio") == true)
        #expect(SourceHealth.failed.concern(for: "Your microphone")?.contains("notes so far are safe") == true)
    }

    @Test func `each source is named as the person hears it, not as we capture it`() {
        #expect(SourceKind.system.sourceName == "Meeting audio")
        #expect(SourceKind.microphone.sourceName == "Your microphone")
    }
}
