import Testing
@testable import Excerpt

struct SubtitlePresentationTests {
    @Test func `collects a phrase instead of flashing every partial word`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "Let's", at: 0)
        player.tick(at: 0.1)
        #expect(player.displayed == nil)
        player.receive(speaker: "YOU", text: "Let's move the launch", at: 0.1)
        player.tick(at: 0.2)
        #expect(player.displayed?.text == "Let's move the launch")
    }

    @Test func `continuous interim updates cannot postpone a caption indefinitely`() {
        var player = SubtitlePresentation()
        for index in 0...4 {
            player.receive(speaker: "YOU", text: "Words \(index)", at: Double(index) * 0.05)
            player.tick(at: Double(index) * 0.05)
            #expect(player.displayed == nil)
        }
        player.receive(speaker: "YOU", text: "Words 5", at: 0.25)
        player.tick(at: 0.25)
        #expect(player.displayed?.text == "Words 5")
    }

    @Test func `visible text stays immutable for its reading time`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "Let's move the launch", at: 0)
        player.tick(at: 0.2)
        player.receive(speaker: "YOU", text: "Let's move the launch to October.", at: 0.3)
        player.tick(at: 0.7)
        #expect(player.displayed?.text == "Let's move the launch")
        player.tick(at: 0.81)
        #expect(player.displayed?.text == "Let's move the launch to October.")
    }

    @Test func `full cards advance to the latest revision when new speech is waiting`() {
        var player = SubtitlePresentation()
        let fullCard = "We agreed to move the launch to October and share the revised plan with everyone."
        player.receive(speaker: "YOU", text: fullCard, at: 0)
        player.tick(at: 0.2)
        player.receive(speaker: "YOU", text: "I'll send", at: 0.3)
        player.receive(speaker: "YOU", text: "I'll send the revised", at: 0.4)
        player.receive(speaker: "YOU", text: "I'll send the revised plan today.", at: 0.5)
        player.tick(at: 0.75)
        #expect(player.displayed?.text == fullCard)
        player.tick(at: 0.81)
        #expect(player.displayed?.text == "I'll send the revised plan today.")
    }

    @Test func `fast continuous speech stays current without flashing each update`() {
        var player = SubtitlePresentation()
        let initial = "We agreed to move the launch to October and share the revised plan with everyone."
        player.receive(speaker: "YOU", text: initial, at: 0)
        player.tick(at: 0.25)
        var previous = player.displayed
        var lastSwitch = 0.25
        for index in 1...80 {
            let now = 0.25 + Double(index) * 0.05
            let text = "The next part of this quickly delivered update is ready for the whole team: \(index)"
            player.receive(speaker: "YOU", text: text, at: now)
            player.tick(at: now)
            if player.displayed != previous {
                #expect(now - lastSwitch >= 0.599)
                #expect(player.displayed?.text == text)
                lastSwitch = now
                previous = player.displayed
            }
            #expect(now - lastSwitch <= 0.651)
        }
    }

    @Test func `a long card stays readable when there is no newer speech`() {
        var player = SubtitlePresentation()
        let text = "We agreed to move the launch to October and share the revised plan with everyone."
        player.receive(speaker: "YOU", text: text, at: 0)
        player.tick(at: 0.2)
        player.tick(at: 2.5)
        #expect(player.displayed?.text == text)
        player.tick(at: 2.9)
        #expect(player.displayed == nil)
    }

    @Test func `a fresh phrase after silence gets the fast start again`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "That's decided.", at: 0)
        player.tick(at: 0.2)
        player.tick(at: 3)
        #expect(player.displayed == nil)
        player.receive(speaker: "SPEAKER", text: "Next topic.", at: 4)
        player.tick(at: 4.2)
        #expect(player.displayed?.text == "Next topic.")
        #expect(player.displayed?.speaker == "SPEAKER")
    }

    @Test func `silence clears subtitles and duplicate results do not resurrect them`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "That's decided.", at: 0)
        player.tick(at: 0.5)
        player.receive(speaker: "YOU", text: "That's decided.", at: 2)
        player.tick(at: 3)
        #expect(player.displayed == nil)
        player.receive(speaker: "YOU", text: "That's decided.", at: 4)
        player.tick(at: 4.8)
        #expect(!player.needsTick)
    }

    @Test func `showing the overlay after silence cannot resurrect queued speech`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "Old speech", at: 0)
        player.tick(at: 10)
        #expect(player.displayed == nil)
        #expect(!player.needsTick)
    }

    @Test func `clear discards queued revisions before another meeting`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "A first meeting", at: 0)
        player.tick(at: 0.5)
        player.receive(speaker: "YOU", text: "A first meeting update", at: 0.6)
        player.receive(speaker: "", text: "", at: 0.7)
        player.tick(at: 2)
        #expect(player.displayed == nil)
        player.receive(speaker: "SPEAKER", text: "A second meeting", at: 3)
        player.tick(at: 3.5)
        #expect(player.displayed?.text == "A second meeting")
    }

    @Test func `speaker change is presented with matching words after the held cue`() {
        var player = SubtitlePresentation()
        player.receive(speaker: "YOU", text: "Yes, go ahead.", at: 0)
        player.tick(at: 0.5)
        player.receive(speaker: "SPEAKER", text: "I'll send the deck.", at: 0.6)
        player.tick(at: 1.0)
        #expect(player.displayed?.speaker == "YOU")
        player.tick(at: 1.11)
        #expect(player.displayed?.speaker == "SPEAKER")
        #expect(player.displayed?.text == "I'll send the deck.")
    }
}
