import Foundation
import Testing
@testable import Excerpt

/// The caption's two decisions — what text the live edge is, and whose it is — held
/// still.
///
/// Both used to be made inline against a polling snapshot, where the only way to check
/// them was to talk at a screen and watch. That is how a caption that stuck to one
/// speaker survived: the bias was constant, so it always looked like a plausible
/// answer.
struct CaptionEdgeTests {

    private func segment(_ start: Double, _ end: Double, _ text: String) -> Segment {
        Segment(start: start, end: end, text: text)
    }

    // MARK: - The live edge

    @Test func `the card spans settled speech and speech still being revised`() {
        let text = CaptionEdge.card(
            settled: [segment(0, 2, "Okay, let's move the launch")],
            pending: [segment(2, 4, "to October")]
        )
        #expect(text == "Okay, let's move the launch to October")
    }

    /// The regression the whole type exists for. `SourceTranscriber` moves a region out
    /// of `pending` and into the transcript when the analyzer's volatile window passes
    /// it; nothing on screen may move because of it.
    @Test func `settling a region does not change what the caption reads`() {
        let before = CaptionEdge.card(
            settled: [segment(0, 2, "I'll take the revised deck")],
            pending: [segment(2, 4, "and get it over")]
        )
        let after = CaptionEdge.card(
            settled: [segment(0, 2, "I'll take the revised deck"),
                      segment(2, 4, "and get it over")],
            pending: []
        )
        #expect(before == after)
    }

    @Test func `regions are read in the order they were said, not the order they arrived`() {
        let text = CaptionEdge.card(
            settled: [segment(4, 6, "before Friday")],
            pending: [segment(2, 4, "Can you send the numbers")]
        )
        #expect(text == "Can you send the numbers before Friday")
    }

    /// The film rule, and the one this type was rewritten for: a card holds still and is
    /// replaced. It must never slide a word at a time through a two-line window.
    @Test func `a card grows by appending and never reflows what is already on screen`() {
        let words = "we are not moving the whole campaign just the hero spot and if legal".split(separator: " ")
        var previous = ""
        for count in 1...words.count {
            let said = words.prefix(count).joined(separator: " ")
            let card = CaptionEdge.card(settled: [], pending: [segment(0, 2, said)])

            // Either the card grew from what was there, or the screen cut to a new one.
            // What it may never do is show a shifted view of the same speech.
            let grew = card.hasPrefix(previous)
            let cut = said.hasSuffix(card)
            #expect(grew || cut, "“\(previous)” → “\(card)” is neither a growth nor a cut")
            previous = card
        }
    }

    @Test func `a card never exceeds two lines' worth of characters`() {
        let long = "we are not moving the whole campaign just the hero spot and if legal signs off we will go with the October date"
        let card = CaptionEdge.card(settled: [], pending: [segment(0, 2, long)])
        #expect(card.count <= CaptionTokens.maxCharsPerLine * CaptionTokens.maxLines)
    }

    @Test func `the cut lands at a sentence ending, the way a film subtitle does`() {
        let text = CaptionEdge.card(settled: [], pending: [
            segment(0, 3, "Okay, let's move the launch to October."),
            segment(3, 5, "I'll take the deck"),
        ])
        #expect(text == "I'll take the deck")
    }

    /// A sentence that has just ended is still the thing to read. Blanking the screen
    /// the moment someone stops talking is how a caption blinks.
    @Test func `a finished sentence stays up until something replaces it`() {
        let text = CaptionEdge.card(settled: [], pending: [segment(0, 3, "That's decided, then.")])
        #expect(text == "That's decided, then.")
    }

    /// Otherwise every "Okay." and "Right." flashes on screen alone for an instant.
    @Test func `a sentence too short to read does not get a card of its own`() {
        let text = CaptionEdge.card(settled: [], pending: [
            segment(0, 1, "Okay."),
            segment(1, 3, "Let's move the launch"),
        ])
        #expect(text == "Okay. Let's move the launch")
    }

    @Test func `a single word longer than a line survives whole`() {
        let text = CaptionEdge.card(settled: [], pending: [segment(0, 2, "antidisestablishmentarianism")])
        #expect(text == "antidisestablishmentarianism")
    }

    @Test func `silence produces nothing rather than a blank line`() {
        #expect(CaptionEdge.card(settled: [], pending: []).isEmpty)
    }

    @Test func `punctuation only recognition cannot replace a finished caption`() {
        let speech = segment(0, 3, "That's decided, then.")
        let text = CaptionEdge.card(settled: [speech], pending: [
            segment(3, 4, "."), segment(4, 5, ".."), segment(5, 6, "… …"),
        ])
        #expect(text == speech.text)
        #expect(CaptionEdge.card(settled: [], pending: [segment(0, 1, ". . .......")]).isEmpty)
    }

    @Test func `stray dots inside a speech result do not become a new card`() {
        let text = CaptionEdge.card(settled: [], pending: [
            segment(0, 3, "That's decided, then. . .. ......."),
        ])
        #expect(text == "That's decided, then.")
    }

    @Test func `dot runs collapse without changing ordinary punctuation or numbers`() {
        #expect(CaptionEdge.card(settled: [], pending: [segment(0, 1, "Wait.......")]) == "Wait…")
        #expect(CaptionEdge.card(settled: [], pending: [segment(0, 1, "Wait...")]) == "Wait…")
        #expect(CaptionEdge.card(settled: [], pending: [segment(0, 1, "Wait…")]) == "Wait…")
        #expect(CaptionEdge.card(settled: [], pending: [segment(0, 1, "It's 3.14, right?")]) == "It's 3.14, right?")
    }

    // MARK: - Whose caption it is

    @Test func `the most recent speaker owns the caption`() {
        #expect(CaptionEdge.owner(you: 12.0, remote: 11.0) == .you)
        #expect(CaptionEdge.owner(you: 11.0, remote: 12.0) == .remote)
    }

    @Test func `one side speaking alone owns it whatever the other's clock says`() {
        #expect(CaptionEdge.owner(you: 3.0, remote: nil) == .you)
        #expect(CaptionEdge.owner(you: nil, remote: 3.0) == .remote)
        #expect(CaptionEdge.owner(you: nil, remote: nil) == nil)
    }

    /// The bug this replaced, in the shape it actually took.
    ///
    /// Each source counts seconds from its own first buffer, so a source that started
    /// three seconds later reports a smaller number for the same moment. Compared raw,
    /// the microphone wins every tie for the whole meeting and the caption sits on YOU
    /// while the far side talks. Corrected onto one clock, the answer inverts.
    @Test func `a later start does not win the caption by having a smaller clock`() {
        let micLocalEnd = 12.0, micOffset = 0.0
        let systemLocalEnd = 11.5, systemOffset = 3.0

        #expect(CaptionEdge.owner(you: micLocalEnd, remote: systemLocalEnd) == .you)
        #expect(CaptionEdge.owner(you: micLocalEnd + micOffset,
                                  remote: systemLocalEnd + systemOffset) == .remote)
    }

    // MARK: - Breaking the lines

    /// The fallback is what draws captions when the engine could not be loaded, so it
    /// still owes the two rules the design is named after.
    @Test func `the fallback breaker keeps two lines and the tail`() {
        let lines = OverlayController.fallbackLines(
            "we are not moving the whole campaign just the hero spot and if legal signs off we will go with October")
        #expect(lines.count <= CaptionTokens.maxLines)
        #expect(lines.last?.hasSuffix("October") == true)
        for line in lines { #expect(line.count <= CaptionTokens.maxCharsPerLine) }
    }
}

/// Line breaking is the third judgement in a caption, and it belongs to the shared
/// engine — the same code the website runs, so a caption breaks in the same place on
/// both. These are the cases `packages/core/src/caption/lines.test.ts` runs against the
/// TypeScript, run here against the bundle in JavaScriptCore.
@MainActor
struct SubtitleLineParityTests {

    private static func makeEngine() throws -> CoreEngine {
        let root = URL(filePath: #filePath)
            .deletingLastPathComponent()   // ExcerptTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // mac
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // excerpt
        return try CoreEngine(engineURL: root.appending(path: "apps/mac/Resources/excerpt-engine.js"))
    }

    @Test func `short text stays on one line`() throws {
        let engine = try Self.makeEngine()
        #expect(try engine.subtitleLines("Let us lock October.", maxChars: 42) == ["Let us lock October."])
    }

    @Test func `a long line never becomes three`() throws {
        let engine = try Self.makeEngine()
        let long = "we are not moving the whole campaign just the hero spot and if legal signs off we will go with the October date"
        #expect(try engine.subtitleLines(long, maxChars: 42).count <= 2)
    }

    @Test func `punctuation beats balance as a break point`() throws {
        let engine = try Self.makeEngine()
        let lines = try engine.subtitleLines("Okay, let us move the launch to October.", maxChars: 36)
        #expect(lines.first == "Okay,")
    }

    @Test func `a conjunction starts the second line rather than ending the first`() throws {
        let engine = try Self.makeEngine()
        let lines = try engine.subtitleLines("the hero film is landing well but the second cut is too long", maxChars: 34)
        #expect(lines.count == 2)
        #expect(lines.last?.hasPrefix("but") == true)
    }

    @Test func `a determiner is not stranded at the end of a line`() throws {
        let engine = try Self.makeEngine()
        let lines = try engine.subtitleLines("but the client feels the second cut is too long", maxChars: 30)
        #expect(lines.first?.hasSuffix("the") == false)
        #expect(lines.last?.hasPrefix("the") == true)
    }

    /// The rule the Mac's own width-wrapping never had: text too long for two lines
    /// keeps the words being spoken now.
    @Test func `text too long for two lines keeps its tail`() throws {
        let engine = try Self.makeEngine()
        let lines = try engine.subtitleLines("one two three four five six seven eight nine ten eleven twelve", maxChars: 12)
        #expect(lines.count <= 2)
        #expect(lines.joined(separator: " ").contains("twelve"))
    }

    @Test func `empty input draws nothing`() throws {
        let engine = try Self.makeEngine()
        #expect(try engine.subtitleLines("   ", maxChars: 42).isEmpty)
    }
}
