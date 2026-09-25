import Foundation
import Testing
@testable import Excerpt

struct CatchUpTests {
    private func event(_ id: String, role: SourceRole = .you, at: Double) -> TranscriptEvent {
        TranscriptEvent(id: id, sessionId: "meeting", role: role, speakerLabel: role == .you ? "YOU" : "SPEAKER", text: "A line of conversation.", isFinal: true, tArrived: at, tStart: at / 1000)
    }

    @Test func `consecutive speech groups without merging across sources`() {
        let events = [event("a", at: 0), event("b", at: 10000), event("c", role: .remote, at: 20000), event("d", at: 30000)]
        let turns = CatchUpTurn.group(events)
        #expect(turns.map(\.id) == ["a", "c", "d"])
        #expect(turns[0].events.map(\.id) == ["a", "b"])
        #expect(CatchUpTurn.group(events + [event("e", at: 40000)]).map(\.id) == turns.map(\.id))
    }

    @Test func `lookback targets a passage inside a long speaker turn`() {
        let events = [event("a", at: 0), event("b", at: 30000), event("c", at: 65000), event("d", at: 90000)]
        #expect(CatchUpTurn.target(in: events, now: 100000, seconds: 60) == "c")
        #expect(CatchUpTurn.target(in: events, now: 100000, seconds: 30) == "d")
        #expect(CatchUpTurn.target(in: events, now: 200000, seconds: 30) == "d")
        #expect(CatchUpTurn.target(in: [], now: 100000, seconds: 60) == nil)
    }
}
