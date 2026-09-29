// Renders the scripted demo meeting (SCRIPT.md) to one audio file, with a cue sheet.
//
//   swift scripts/voice-meeting.swift assets/meeting.wav
//
// Both parts are synthetic: Siri's natural "Nora" voice for Sam, and the same voice
// pitched down for the host, so the two read as different people. The lines are the
// script's, word for word, so the extractor finds the same decision, actions and
// question it would in a live take.
import AVFoundation

let lines: [(who: String, text: String)] = [
    ("SAM", "Okay, quick one. I'm sharing the launch timeline now."),
    ("YOU", "Thanks. So the beta is ready, but the help center isn't."),
    ("SAM", "Right. If we ship on the seventh, the docs won't be finished."),
    ("YOU", "Then let's move the launch to October fourteenth."),
    ("SAM", "That works for design. The onboarding video needs a new end card."),
    ("YOU", "I'll send the updated deck to the team by Friday."),
    ("SAM", "Do we still need the press embargo?"),
    ("YOU", "I'm not sure yet. I'll check with legal on Monday."),
    ("SAM", "Great. That's decided then, October fourteenth."),
    ("YOU", "Perfect. Thanks, Sam."),
]

// Each line is written to its own file; scripts/voice-meeting.sh deepens the host's
// lines (the voice ignores pitchMultiplier) and assembles the meeting with its pauses.
let dir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "lines", isDirectory: true)
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
let voice = AVSpeechSynthesisVoice(identifier: "com.apple.siri.natural.Nora")
    ?? AVSpeechSynthesisVoice(language: "en-US")!
let synth = AVSpeechSynthesizer()

for (index, line) in lines.enumerated() {
    let url = dir.appendingPathComponent(String(format: "%02d", index) + "-\(line.who).caf")
    let utterance = AVSpeechUtterance(string: line.text)
    utterance.voice = voice
    utterance.rate = line.who == "SAM" ? 0.5 : 0.47
    var file: AVAudioFile?
    let done = DispatchSemaphore(value: 0)
    synth.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        if pcm.frameLength == 0 { done.signal(); return }
        if file == nil {
            file = try! AVAudioFile(forWriting: url, settings: pcm.format.settings,
                                    commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
        }
        try! file!.write(from: pcm)
    }
    while done.wait(timeout: .now() + 0.05) == .timedOut { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    print("\(url.lastPathComponent)\t\(line.text)")
}
