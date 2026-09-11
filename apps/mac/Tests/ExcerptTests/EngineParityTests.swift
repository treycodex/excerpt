import Foundation
import Testing
@testable import Excerpt

/// The Swift half of the parity harness.
///
/// `packages/core/fixtures/parity.json` is read by vitest against the TypeScript
/// source and by this suite against the compiled bundle running in JavaScriptCore.
/// A case that passes there and fails here means the website and the Mac app
/// disagree about what a decision is — the one bug "one shared engine" exists to
/// make impossible, and the one a Swift port would have made invisible.
@MainActor
struct EngineParityTests {

    private struct Fixtures: Decodable {
        struct Expectation: Decodable {
            var category: String?
            var state: String?
            var assignee: String?
            var due: String?
            var titleIsSpanOf: String?
        }
        struct Case: Decodable {
            var name: String
            var lines: [[String]]
            var expect: [Expectation]
        }
        var reference: String
        var cases: [Case]
    }

    /// The repo, located from this file rather than from a working directory, so the
    /// suite runs the same from `swift test`, an IDE, or CI.
    private static var repoRoot: URL {
        URL(filePath: #filePath)               // …/apps/mac/Tests/ExcerptTests/EngineParityTests.swift
            .deletingLastPathComponent()            // ExcerptTests
            .deletingLastPathComponent()            // Tests
            .deletingLastPathComponent()            // mac
            .deletingLastPathComponent()            // apps
            .deletingLastPathComponent()            // excerpt
    }

    private static func makeEngine() throws -> CoreEngine {
        try CoreEngine(engineURL: repoRoot.appending(path: "apps/mac/Resources/excerpt-engine.js"))
    }

    private static func loadFixtures() throws -> Fixtures {
        let url = repoRoot.appending(path: "packages/core/fixtures/parity.json")
        return try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: url))
    }

    @Test func `the bundle loads and reports the version this app expects`() throws {
        _ = try Self.makeEngine()      // the initializer is the assertion
    }

    @Test func `every parity fixture agrees with the TypeScript run`() throws {
        let engine = try Self.makeEngine()
        let fixtures = try Self.loadFixtures()
        let reference = try #require(ISO8601DateFormatter().date(from: fixtures.reference))

        for testCase in fixtures.cases {
            let events = testCase.lines.enumerated().map { index, line in
                TranscriptEvent(
                    id: "e\(index)",
                    sessionId: "parity",
                    role: line[0] == "you" ? .you : .remote,
                    speakerLabel: line[0] == "you" ? "YOU" : "SPEAKER",
                    text: line[1],
                    isFinal: true,
                    tArrived: Double(index) * 4000
                )
            }

            let items = try engine.extract(events: events, reference: reference)
            #expect(items.count == testCase.expect.count, "\(testCase.name): \(items.map(\.title))")
            guard items.count == testCase.expect.count else { continue }

            for (item, want) in zip(items, testCase.expect) {
                if let category = want.category { #expect(item.category.rawValue == category, "\(testCase.name)") }
                if let state = want.state { #expect(item.state.rawValue == state, "\(testCase.name)") }
                if let assignee = want.assignee { #expect(item.assignee.rawValue == assignee, "\(testCase.name)") }
                if let due = want.due { #expect(item.due == due, "\(testCase.name)") }
                if let span = want.titleIsSpanOf {
                    // Extractive means the title is a run of words that was actually said.
                    let title = item.title.hasSuffix("…") ? String(item.title.dropLast()) : item.title
                    #expect(span.contains(title), "\(testCase.name): “\(title)” is not a span of the sentence")
                }
            }
        }
    }

    /// The app's fallback when the optional on-device summary is unavailable. It was
    /// missing from the bundle entirely, so a failed summary left a meeting carrying
    /// no notes at all — which is what happened to a real capture on 11 September.
    @Test func `the extractive notes document is reachable from the app`() throws {
        let engine = try Self.makeEngine()
        let events = ["The onboarding flow loses new teams at the permissions step.",
                      "Legal approval is still pending, so the launch moves to October."]
            .enumerated().map { index, text in
                TranscriptEvent(id: "e\(index)", sessionId: "notes", role: .remote, speakerLabel: "SPEAKER",
                                text: text, isFinal: true, tArrived: Double(index) * 4000)
            }
        let meeting = Meeting(id: "notes", title: "Launch review", startedAt: "2026-09-07T09:00:00Z",
                              processing: .onDevice, events: events, items: [])
        let notes = try engine.notes(for: meeting)
        #expect(notes.method == "extractive")
        #expect(!notes.keyPoints.isEmpty)
        // Extractive means every bullet cites something that was actually said.
        for bullet in notes.keyPoints + notes.topics.flatMap(\.bullets) {
            let quote = try #require(bullet.evidence.first?.quote)
            #expect(events.contains { $0.text.contains(quote) }, "“\(quote)” was never said")
        }
    }

    /// One definition of "this was a talk, not a conversation", shared by both
    /// surfaces so they cannot tell a user two different things about one meeting.
    @Test func `the shape of a recording is judged by the shared engine`() throws {
        let engine = try Self.makeEngine()
        let talk = (0..<32).map { index in
            TranscriptEvent(id: "t\(index)", sessionId: "shape", role: .remote, speakerLabel: "SPEAKER",
                            text: "so the next archetype is the one everybody in college knows about.",
                            isFinal: true, tArrived: Double(index) * 4000)
        }
        let meeting = { (events: [TranscriptEvent]) in
            Meeting(id: "shape", title: "Recording", startedAt: "2026-09-07T09:00:00Z",
                    processing: .onDevice, events: events, items: [])
        }
        #expect(try engine.shapeNotice(for: meeting(talk)).contains("Only one voice"))

        let conversation = talk + [TranscriptEvent(id: "mine", sessionId: "shape", role: .you,
            speakerLabel: "YOU", text: "I'll take the revised deck and send it Friday.",
            isFinal: true, tArrived: 200_000)]
        #expect(try engine.shapeNotice(for: meeting(conversation)).isEmpty)
    }

    @Test func `subtitle lines come from the shared breaker, not a Swift copy`() throws {
        let engine = try Self.makeEngine()
        let lines = try engine.subtitleLines(
            "Okay. Let's move the campaign launch to October. That's decided.", maxChars: 42)
        #expect(lines.count <= 2)
        #expect(lines.allSatisfy { $0.count <= 42 })
        #expect(lines.joined(separator: " ").contains("campaign launch"))
    }

    @Test func `ranking orders by what the user said they care about`() throws {
        let engine = try Self.makeEngine()
        let events = [
            TranscriptEvent(id: "e0", sessionId: "s", role: .remote, speakerLabel: "SPEAKER",
                            text: "Okay. Let's move the campaign launch to October. That's decided.",
                            isFinal: true, tArrived: 0),
            TranscriptEvent(id: "e1", sessionId: "s", role: .you, speakerLabel: "YOU",
                            text: "I'll send the budget summary to the client by Thursday.",
                            isFinal: true, tArrived: 4000),
        ]
        let items = try engine.extract(events: events, reference: Date(timeIntervalSince1970: 1_788_000_000))
        var preferences = Preferences.default
        preferences.boosts = try engine.boosts(for: "I care about client budgets")

        let ranked = try engine.rank(items, preferences: preferences)
        #expect(ranked.first?.title.contains("budget") == true)
        // Nothing is ever hidden for not being asked for.
        #expect(ranked.count == items.count)
        #expect(ranked.first?.matched?.isEmpty == false)
    }
}
