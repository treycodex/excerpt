import Foundation
import Testing
@testable import Excerpt

struct NotesSummarizerTests {
    private func event(_ text: String, id: String = "e1") -> TranscriptEvent {
        TranscriptEvent(id: id, sessionId: "m", role: .you, speakerLabel: "YOU", text: text, isFinal: true, tArrived: 0)
    }

    @Test func `long transcripts keep every character and source reference`() {
        let text = String(repeating: "The launch needs review. ", count: 900)
        let chunks = NotesSummarizer.chunks([event(text)])
        #expect(chunks.count > 1)
        #expect(chunks.flatMap { $0 }.map(\.text).joined() == text)
        #expect(chunks.allSatisfy { $0.map(\.text.count).reduce(0, +) <= 4200 })
        #expect(chunks.flatMap { $0 }.allSatisfy { $0.event.id == "e1" })
    }

    @Test func `fabricated citations cannot enter notes`() {
        let sources = [NotesSummarizer.Source(event: event("Legal approval is pending."), text: "Legal approval is pending.")]
        #expect(NotesSummarizer.supported(DraftNotePoint(text: "Approval is pending.", source: 1, quote: "Legal approval is pending."), sources: sources, id: "n") == nil)
        #expect(NotesSummarizer.supported(DraftNotePoint(text: "Approved.", source: 0, quote: "Legal approved it."), sources: sources, id: "n") == nil)
        #expect(NotesSummarizer.supported(DraftNotePoint(text: "Approval is pending.", source: 0, quote: "Legal approval is pending."), sources: sources, id: "n")?.evidence.first?.eventIds == ["e1"])
    }

    @Test func `a model cannot turn a cited commitment into completed work`() {
        let quote = "I'll send the revised deck by Friday."
        let sources = [NotesSummarizer.Source(event: event(quote), text: quote)]
        let point = DraftNotePoint(text: "Revised deck sent by Friday.", source: 0, quote: quote)
        #expect(NotesSummarizer.supported(point, sources: sources, id: "n")?.text == quote)
    }

    // MARK: - The 11 September regression

    /// Rebuilt from the capture the user reported: a training video summarised into
    /// nine bullet slots holding three distinct, contentless bullets, under a topic
    /// heading — "Launch Timing" — for a subject the recording never mentioned. The
    /// heading came from an exemplar in the prompt, which is now gone; these cases
    /// hold the line that made it visible.
    private enum Capture {
        static let incomeQuote = "for ways to make extra income as a software engineer."
        static let collegeQuote = "Have you been in college for a while now? You probably noticed that every person."
        static let partyQuote = "Yo, I just aced my midterm. Gee, congrats, bro. We got a drink to that."
        static let text = [incomeQuote, collegeQuote, partyQuote].joined(separator: " ")
    }

    private func captureSources() -> [NotesSummarizer.Source] {
        [NotesSummarizer.Source(event: event(Capture.text), text: Capture.text)]
    }

    private func point(_ text: String, _ quote: String) -> DraftNotePoint {
        DraftNotePoint(text: text, source: 0, quote: quote)
    }

    @Test func `a bullet that only names its subject is not a note`() {
        #expect(NotesSummarizer.isMeta("Discuss ways to make extra income as a software engineer."))
        #expect(NotesSummarizer.isMeta("Discuss college archetypes."))
        #expect(NotesSummarizer.isMeta("Discussion of the party animal archetype."))
        #expect(NotesSummarizer.isMeta("The team talked about pricing."))
        #expect(NotesSummarizer.isMeta("We went over the numbers."))
        #expect(NotesSummarizer.isMeta("Overview of the onboarding flow."))
        // Reporting what was actually said is the whole point, and survives.
        #expect(!NotesSummarizer.isMeta("The launch moves to October because approval is pending."))
        #expect(!NotesSummarizer.isMeta("Onboarding loses new teams at the permissions step."))
        #expect(!NotesSummarizer.isMeta("Discovery calls run long."))
    }

    @Test func `the three contentless bullets are all rejected at verification`() {
        let sources = captureSources()
        let drafted = [
            point("Discuss ways to make extra income as a software engineer.", Capture.incomeQuote),
            point("Discuss college archetypes.", Capture.collegeQuote),
            point("Discuss the party animal archetype.", Capture.partyQuote),
        ]
        for draft in drafted {
            #expect(NotesSummarizer.supported(draft, sources: sources, id: "n") == nil)
        }
    }

    @Test func `one bullet appears once, whatever the model repeats`() throws {
        let sources = captureSources()
        let repeated = point("Extra income needs a second skill alongside engineering.", Capture.incomeQuote)
        let draft = DraftMeetingNotes(
            keyPoints: [repeated],
            topics: [
                DraftNoteTopic(title: "Extra Income", bullets: [repeated]),
                DraftNoteTopic(title: "College Archetypes", bullets: [repeated]),
            ])
        let notes = try #require(NotesSummarizer.assemble([(draft, sources)]))
        #expect(notes.keyPoints.count == 1)
        // Both topics were emptied by de-duplication, so neither is printed at all.
        #expect(notes.topics.isEmpty)
        #expect((notes.keyPoints + notes.topics.flatMap(\.bullets)).count == 1)
    }

    @Test func `the same heading in a later passage remains a later topic`() throws {
        let sources = captureSources()
        let first = DraftMeetingNotes(keyPoints: [], topics: [DraftNoteTopic(
            title: "Extra income", bullets: [point("A second income stream takes a skill beyond engineering.", Capture.incomeQuote)])])
        let second = DraftMeetingNotes(keyPoints: [], topics: [DraftNoteTopic(
            title: "Extra Income", bullets: [point("Most engineers never start one.", Capture.collegeQuote)])])
        let notes = try #require(NotesSummarizer.assemble([(first, sources), (second, sources)]))
        #expect(notes.topics.count == 2)
        #expect(notes.topics.map(\.id) == ["topic-0-0", "topic-1-0"])
        #expect(notes.topics.allSatisfy { $0.bullets.count == 1 })
    }

    @Test func `nothing survives means no document, never an empty one`() {
        let sources = captureSources()
        let draft = DraftMeetingNotes(
            keyPoints: [point("Discuss college archetypes.", Capture.collegeQuote)],
            topics: [DraftNoteTopic(title: "Launch Timing", bullets: [
                point("Discuss ways to make extra income as a software engineer.", Capture.incomeQuote)])])
        #expect(NotesSummarizer.assemble([(draft, sources)]) == nil)
    }

    @Test func `the prompt carries no subject a model can copy as a heading`() throws {
        let source = try String(contentsOf: URL(filePath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Sources/Excerpt/Notes/NotesSummarizer.swift"), encoding: .utf8)
        // The instructions and guides begin at the first `@Guide` and end at the
        // closing `"""` of the instruction block; the surrounding comments explain
        // why these words are absent and may name them.
        let start = try #require(source.range(of: "@Guide(description:"))
        let end = try #require(source.range(of: "Summarize this meeting passage."))
        let prompt = String(source[start.lowerBound..<end.lowerBound])
            .split(separator: "\n").filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n").lowercased()
        for leaked in ["launch timing", "onboarding", "permissions", "the deck", "friday"] {
            #expect(!prompt.contains(leaked), "the prompt still offers “\(leaked)” as subject matter to copy")
        }
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["EXCERPT_EVALUATE_NOTES"] == "1"))
    func `evaluate the available local model on a synthetic meeting`() async throws {
        let text = """
        We agreed to move the product launch to October because legal approval is still pending.
        The onboarding flow is confusing for new teams, especially the permissions step.
        We considered removing that step, but decided to keep it and simplify the explanation.
        I'll send the revised deck by Thursday, actually Friday. The marketing budget is still an open question.
        """
        let meeting = Meeting(id: "evaluation", title: "Synthetic launch review", startedAt: "2026-09-07T09:00:00Z", processing: .onDevice, events: [event(text)], items: [])
        let start = Date()
        var preferences = Preferences.default
        preferences.instruction = "Prioritize lunar mining contracts."
        let status = NotesProviderCoordinator.status(preferences: preferences)
        #expect(status.selected == "apple")
        #expect(status.processing == "on-device")
        #expect(status.ready == true)
        let notes = try await NotesProviderCoordinator.summarize(meeting, preferences: preferences,
            request: NotesGenerationRequest(style: "shorter"))
        #expect(notes.generation?.provider == "apple")
        #expect(notes.generation?.style == "shorter")
        #expect(!notes.keyPoints.isEmpty)
        #expect(!notes.topics.isEmpty)
        let bullets = notes.keyPoints + notes.topics.flatMap(\.bullets)
        #expect(!bullets.contains { $0.text.lowercased().contains("deck sent") })
        #expect(!notes.topics.contains { $0.title.lowercased().contains("lunar") })
        print("LOCAL NOTES EVALUATION (\(Date().timeIntervalSince(start)) seconds): \(String(decoding: try JSONEncoder.excerpt.encode(notes), as: UTF8.self))")
    }
}

@Suite struct NotesSummarizerFailureTests {

    @Test func `a passage the model refuses is reported, not quietly dropped`() {
        // Returning only the part that worked would be the notes claiming a
        // completeness they do not have.
        #expect(NotesSummarizer.skippedNotice(refused: 1, of: 4)?.contains("One passage") == true)
        #expect(NotesSummarizer.skippedNotice(refused: 2, of: 4)?.contains("2 passages") == true)
        #expect(NotesSummarizer.skippedNotice(refused: 1, of: 4)?.contains("transcript is unchanged") == true)
    }

    @Test func `nothing is said when every passage worked`() {
        #expect(NotesSummarizer.skippedNotice(refused: 0, of: 4) == nil)
    }

    @Test func `nothing is said when none of them worked`() {
        // That case throws noSupportedNotes and falls back to the extractive
        // document; a notice about omissions would describe notes that do not exist.
        #expect(NotesSummarizer.skippedNotice(refused: 3, of: 3) == nil)
        #expect(NotesSummarizer.skippedNotice(refused: 0, of: 0) == nil)
    }

    @Test func `a passage is small enough for the model to answer about`() {
        // Measured on this Mac against three saved meetings. At 4200 the local model
        // failed every token budget tried; at 2000 both passages of the reported
        // meeting parsed and 16 points survived verification. Below about 2000 the
        // yield falls again as the model loses the context a point needs.
        #expect(NotesSummarizer.chunkBudget <= 2400)
        #expect(NotesSummarizer.chunkBudget >= 1800)
    }

    @Test func `the answer is not allowed to crowd out the question`() {
        // The reservation comes out of the same context window as the passage, so
        // raising it bought "Exceeded model context window size" instead of room.
        #expect(NotesSummarizer.responseTokens <= 1800)
        // And a passage's quotes cannot exceed the passage, so this is ample.
        #expect(NotesSummarizer.responseTokens * 3 > NotesSummarizer.chunkBudget)
    }

    @Test func `a long meeting is given time for the requests it needs`() {
        // Each passage is its own request; a flat two minutes reported a timeout for
        // work that was proceeding normally.
        let short = Array(repeating: "word", count: 200).joined(separator: " ")
        let long = Array(repeating: "word", count: 20_000).joined(separator: " ")
        let events = { (text: String) in [TranscriptEvent(
            id: "e", sessionId: "s", role: .remote, speakerLabel: "SPEAKER",
            text: text, isFinal: true, tArrived: 0)] }
        #expect(NotesSummarizer.chunks(events(long)).count > NotesSummarizer.chunks(events(short)).count)
    }
}

@Suite struct BridgeErrorTests {

    private struct Described: LocalizedError {
        var errorDescription: String? { "On-device summaries need Apple Intelligence enabled." }
    }
    private struct Internal: Error {}

    @Test func `an error written for a person is kept`() {
        #expect(NotesBridge.readable(Described()) == "On-device summaries need Apple Intelligence enabled.")
    }

    @Test func `a framework's own wording never reaches the reader`() {
        // "Failed to deserialize a Generable type from model output" was shown above
        // somebody's notes, in a product that otherwise speaks in their words.
        let shown = NotesBridge.readable(Internal())
        #expect(!shown.contains("Generable"))
        #expect(shown.contains("transcript is unchanged"))
    }

    @Test func `cancelling says so rather than sounding like a fault`() {
        #expect(NotesBridge.readable(CancellationError()) == "That was cancelled.")
    }
}
