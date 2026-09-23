import Foundation
import Observation

/// A brief, opt-in meter using the real capture boundary. It neither transcribes
/// nor creates a meeting, and discards all audio buffers immediately.
@MainActor
@Observable
final class InputCheck {
    private(set) var running = false
    private(set) var microphoneMessage = "Say a few words to check your microphone."
    private(set) var systemMessage = "Play meeting audio to check the other side."
    private(set) var microphoneLevel: Double = 0
    private(set) var systemLevel: Double = 0
    private(set) var error: String?
    private let microphone: MicrophoneController
    private let makeCapture: (String) -> any MeetingCapturing
    @ObservationIgnored private var capture: (any MeetingCapturing)?
    @ObservationIgnored private var task: Task<Void, Never>?
    @ObservationIgnored private var stopTask: Task<Void, Never>?
    private var runID: UUID?

    init(microphone: MicrophoneController,
         makeCapture: @escaping (String) -> any MeetingCapturing = { id in CaptureEngine(selectedMicrophoneID: { id }) }) {
        self.microphone = microphone
        self.makeCapture = makeCapture
    }

    func start() async {
        guard !running, runID == nil, !microphone.selectionLocked else { return }
        error = nil
        let id: String
        do { id = try microphone.selectedDeviceIDForCapture() }
        catch { self.error = error.localizedDescription; return }
        let run = UUID()
        runID = run
        running = true
        microphone.selectionLocked = true
        let capture = makeCapture(id)
        self.capture = capture
        microphoneMessage = "Starting the selected microphone…"
        systemMessage = "Starting meeting audio…"
        do {
            try await capture.start(onBuffer: { _, _, _ in }, onStreamError: { [weak self] message in
                Task { @MainActor in
                    guard let self, self.runID == run else { return }
                    self.error = message
                    await self.stop()
                }
            })
            guard runID == run else { await capture.stop(); return }
            task = Task { [weak self] in
                // Bounded so leaving setup unattended never leaves capture running.
                for _ in 0..<60 {
                    guard let self, self.runID == run, !Task.isCancelled else { return }
                    self.sample()
                    do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                }
                await self?.stop()
            }
        } catch {
            guard runID == run else { await capture.stop(); return }
            self.error = error.localizedDescription
            await stop()
        }
    }

    func sample() {
        guard let capture, running else { return }
        microphone.refresh()
        let stats = capture.statistics()
        let mic = stats[.microphone] ?? SourceStats()
        let system = stats[.system] ?? SourceStats()
        microphoneLevel = min(1, Double(mic.level) * 8)
        systemLevel = min(1, Double(system.level) * 8)
        microphoneMessage = microphone.snapshot().health == .missing
            ? microphone.snapshot().message
            : Self.message(mic, source: "Microphone")
        systemMessage = Self.message(system, source: "Meeting audio")
    }

    private static func message(_ stats: SourceStats, source: String) -> String {
        if let error = stats.lastError { return error }
        if stats.buffers == 0 { return "\(source): waiting for audio. Check permissions if this continues." }
        return stats.level > 0.01 ? "\(source): sound detected." : "\(source): connected, quiet right now."
    }

    func stop() async {
        if let stopTask { await stopTask.value; return }
        guard running || capture != nil else { return }
        runID = nil
        task?.cancel()
        task = nil
        let previous = capture
        capture = nil
        let stopping = Task { @MainActor in
            await previous?.stop()
            running = false
            microphone.selectionLocked = false
            microphoneLevel = 0
            systemLevel = 0
        }
        stopTask = stopping
        await stopping.value
        stopTask = nil
    }
}
