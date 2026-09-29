import Foundation
import Testing
@testable import Excerpt

@MainActor
struct MeetingDetectorTests {
    private func waitUntil(_ condition: @escaping @MainActor () -> Bool) async -> Bool {
        for _ in 0..<200 {
            if condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return condition()
    }

    private var zoom: MeetingApp { try! #require(MeetingApp.matching("us.zoom.xos")) }

    @Test func `helpers count as their app and unrelated processes do not`() {
        #expect(MeetingApp.matching("com.google.Chrome.helper")?.name == "Chrome")
        #expect(MeetingApp.matching("com.apple.WebKit.GPU")?.name == "Safari")
        #expect(MeetingApp.matching("company.thebrowser.browser.helper")?.name == "Arc")
        #expect(MeetingApp.matching("com.apple.avconferenced")?.name == "FaceTime")
        #expect(MeetingApp.matching("com.microsoft.teams2")?.name == "Microsoft Teams")
        #expect(MeetingApp.matching("com.tinyspeck.slackmacgap.helper")?.name == "Slack")
        #expect(MeetingApp.matching("com.google.Chromecast") == nil)
        #expect(MeetingApp.matching("com.apple.VoiceMemos") == nil)
        #expect(MeetingApp.matching("com.excerpt.app") == nil)
    }

    @Test func `window titles name the meeting only when they really do`() {
        #expect(MeetingTitleGuess.name(in: "Meet – Weekly sync") == "Weekly sync")
        #expect(MeetingTitleGuess.name(in: "Meet - Launch review - Google Chrome") == "Launch review")
        #expect(MeetingTitleGuess.name(in: "Meet - abc-defg-hij") == nil)
        // Chrome's playing-tab speaker is not part of the name, and must not hide a code.
        #expect(MeetingTitleGuess.name(in: "Meet - umb-vtez-zti 🔊") == nil)
        #expect(MeetingTitleGuess.name(in: "Meet – Weekly sync 🔊 - Google Chrome") == "Weekly sync")
        #expect(MeetingTitleGuess.name(in: "🔴 Meet – Weekly sync") == "Weekly sync")
        #expect(MeetingTitleGuess.name(in: "Q3 planning | Microsoft Teams") == "Q3 planning")
        #expect(MeetingTitleGuess.name(in: "Meeting | Q3 planning | Microsoft Teams") == "Q3 planning")
        #expect(MeetingTitleGuess.name(in: "Chat | Microsoft Teams") == nil)
        #expect(MeetingTitleGuess.name(in: "Zoom Meeting") == nil)
        #expect(MeetingTitleGuess.name(in: "Inbox (3) - Gmail") == nil)
        #expect(MeetingTitleGuess.guess(from: ["Zoom Workplace", "Meet – Design crit"]) == "Design crit")
    }

    @Test func `a call app counts once its microphone use settles, and ends only after a pause`() async {
        let detector = MeetingDetector(beginDelay: .milliseconds(20), endDelay: .milliseconds(60), watcher: nil)
        var edges: [MeetingDetector.Edge] = []
        detector.onEdge = { edges.append($0) }

        detector.update(["us.zoom.xos", "com.apple.VoiceMemos"])
        #expect(await waitUntil { edges == [.began(zoom)] })
        #expect(detector.active == [zoom])

        // Muting that briefly releases the device is the same meeting.
        detector.update([])
        try? await Task.sleep(for: .milliseconds(15))
        detector.update(["us.zoom.xos"])
        try? await Task.sleep(for: .milliseconds(100))
        #expect(edges == [.began(zoom)])

        detector.update([])
        #expect(await waitUntil { edges == [.began(zoom), .ended(zoom)] })
        #expect(detector.active.isEmpty)
    }

    @Test func `a momentary grab of the microphone is not a meeting`() async {
        let detector = MeetingDetector(beginDelay: .milliseconds(40), endDelay: .milliseconds(40), watcher: nil)
        var edges: [MeetingDetector.Edge] = []
        detector.onEdge = { edges.append($0) }

        detector.update(["us.zoom.xos"])
        try? await Task.sleep(for: .milliseconds(10))
        detector.update([])
        try? await Task.sleep(for: .milliseconds(100))
        #expect(edges.isEmpty)
    }
}
