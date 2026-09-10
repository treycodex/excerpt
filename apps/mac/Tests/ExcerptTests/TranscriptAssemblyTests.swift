import Foundation
import Testing
@testable import Excerpt

/// Every case here came from a real capture, not from imagination. The first run
/// against actual speech produced five notes from four sentences: two decisions built
/// out of half a sentence, and an action assigned to the user that the loudspeakers
/// had said.
struct TranscriptAssemblyTests {

    private func event(
        _ role: SourceRole, _ text: String, _ start: Double, _ end: Double, id: String = UUID().uuidString
    ) -> TranscriptEvent {
        TranscriptEvent(
            id: id, sessionId: "m", role: role,
            speakerLabel: role == .you ? "YOU" : "SPEAKER",
            text: text, isFinal: true, tArrived: start * 1000,
            tStart: start, tEnd: end
        )
    }

    // MARK: - Utterances

    @Test func `abutting fragments of one sentence become one sentence`() {
        // Measured: settling on a timer cut here, and extraction read "Let's move."
        // as a complete decision.
        let assembled = TranscriptAssembly.coalesce([
            event(.remote, "Okay. Let's move.", 6.92, 7.88),
            event(.remote, " the campaign launch to October.", 7.88, 10.24),
        ])
        #expect(assembled.count == 1)
        #expect(assembled.first?.text == "Okay. Let's move the campaign launch to October.")
        #expect(assembled.first?.tEnd == 10.24)
    }

    @Test func `a real pause keeps two utterances apart`() {
        let assembled = TranscriptAssembly.coalesce([
            event(.remote, "That's decided.", 10.2, 11.2),
            event(.remote, "Do we still need the out-of-home buy?", 14.0, 16.0),
        ])
        #expect(assembled.count == 2)
    }

    @Test func `the two sources are never joined to each other`() {
        let assembled = TranscriptAssembly.coalesce([
            event(.remote, "Are we agreed on October?", 1.0, 2.0),
            event(.you, "Yes, let's lock it.", 2.0, 3.0),
        ])
        #expect(assembled.count == 2)
        #expect(assembled.map(\.role) == [.remote, .you])
    }

    @Test func `a full stop at the cut is the recogniser's, not the speaker's`() {
        #expect(TranscriptAssembly.join("Let's move.", "the launch to October.")
                == "Let's move the launch to October.")
        // A genuine sentence end is left alone.
        #expect(TranscriptAssembly.join("That's decided.", "Do we still need it?")
                == "That's decided. Do we still need it?")
    }

    @Test func `a longer re-report replaces rather than repeats`() {
        // Measured: concatenating these gave the sentence twice; dropping the longer
        // one lost "by Thursday", and the deadline with it.
        #expect(TranscriptAssembly.join("I'll take the revised deck and get it over",
                                        "I'll take the revised deck and get it over by Thursday.")
                == "I'll take the revised deck and get it over by Thursday.")
    }

    // MARK: - Echoes

    @Test func `the speakers' words never become the user's commitment`() {
        // The regression this whole file exists for: without headphones the microphone
        // hears the far side, and a first-person sentence it did not say would be
        // assigned to the user.
        let spoken = "I'll take the revised deck and get it over by Thursday."
        let kept = TranscriptAssembly.withoutEchoes([
            event(.remote, spoken, 11.20, 14.90),
            event(.you, spoken, 11.25, 14.95),
        ])
        #expect(kept.count == 1)
        #expect(kept.first?.role == .remote)
    }

    @Test func `only the microphone's copy is ever dropped`() {
        // The far side is the authority on what the far side said.
        let kept = TranscriptAssembly.withoutEchoes([
            event(.remote, "Let's move the launch.", 1.0, 3.0),
            event(.remote, "Let's move the launch.", 1.1, 3.1),
        ])
        #expect(kept.count == 2)
    }

    @Test func `speaking at the same time as someone else is not an echo`() {
        let kept = TranscriptAssembly.withoutEchoes([
            event(.remote, "Do we still need the out-of-home buy?", 1.0, 3.0),
            event(.you, "I'm not sure that spend is justified.", 1.2, 3.4),
        ])
        #expect(kept.count == 2)
    }

    @Test func `the same words much later are said twice, not heard twice`() {
        let kept = TranscriptAssembly.withoutEchoes([
            event(.remote, "Let's move the launch to October.", 1.0, 3.0),
            event(.you, "Let's move the launch to October.", 400.0, 402.0),
        ])
        #expect(kept.count == 2)
    }

    @Test func `without a shared clock nothing is called an echo`() {
        // The website has no audio timestamps at all. Guessing there would be worse
        // than leaving both in: a false positive costs more than a miss.
        var browserEvent = event(.you, "Let's move the launch.", 1.0, 3.0)
        browserEvent.tStart = nil
        browserEvent.tEnd = nil
        let kept = TranscriptAssembly.withoutEchoes([
            event(.remote, "Let's move the launch.", 1.0, 3.0),
            browserEvent,
        ])
        #expect(kept.count == 2)
    }

    @Test func `the whole first capture, end to end`() {
        // Verbatim from the first run against real speech, before any of this existed.
        let raw = [
            event(.remote, "Okay.", 6.92, 7.88), event(.you, "Okay.", 6.97, 7.93),
            event(.remote, " Let's move.", 7.88, 8.20), event(.you, " Let's move.", 7.93, 8.24),
            event(.remote, "of the campaign launch to October.", 8.20, 10.24),
            event(.you, ", to...", 8.24, 10.28),
            event(.remote, " That's decided.", 10.24, 11.20),
            event(.you, " That's to say.", 10.28, 11.30),
        ]
        let assembled = TranscriptAssembly.assemble(raw)

        // One speaker, one utterance, whole sentences — not eight fragments and not a
        // word of it attributed to the user.
        #expect(assembled.count == 1)
        #expect(assembled.first?.role == .remote)
        #expect(assembled.first?.text.contains("campaign launch to October") == true)
        #expect(assembled.allSatisfy { $0.role != .you })
    }
}
