import AVFoundation
import Foundation

/// Drives capture + both transcribers and judges the gates that depend on them.
@MainActor
final class CaptureSession: ObservableObject {
    @Published var running = false
    @Published var elapsed: TimeInterval = 0
    @Published var audio: [SourceKind: SourceStats] = [:]
    @Published var speech: [SourceKind: TranscriptStats] = [:]

    private let engine = CaptureEngine()
    private let transcribers: [SourceKind: SourceTranscriber] = [
        .system: SourceTranscriber(kind: .system),
        .microphone: SourceTranscriber(kind: .microphone),
    ]
    private var ticker: Timer?
    let overlay = OverlayController()
    private var startedAt: Date?
    private unowned let board: GateBoard

    init(board: GateBoard) { self.board = board }

    func start() async {
        guard !running else { return }
        board.note("Starting capture — one SCStream, two audio outputs…")

        do {
            for (_, t) in transcribers { try await t.start() }
        } catch {
            board.set("5", .fail, "transcriber start failed: \(error)")
            board.note("  transcriber failed: \(error)", kind: .bad)
            return
        }

        do {
            try await engine.start(
                onBuffer: { [transcribers] kind, buffer, time in
                    Task { await transcribers[kind]?.feed(buffer, at: time) }
                },
                onStreamError: { [weak self] message in
                    Task { @MainActor in
                        self?.board.note("  \(message)", kind: .bad)
                        self?.board.set("12", .fail, message)
                    }
                }
            )
        } catch {
            board.set("2", .fail, "SCStream start failed: \(error.localizedDescription)")
            board.note("  capture failed: \(error)", kind: .bad)
            for (_, t) in transcribers { await t.stop() }
            return
        }

        running = true
        startedAt = Date()
        board.note("Capture running. Play speech in a meeting, and say something yourself.", kind: .good)

        ticker = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    private func refresh() async {
        audio = engine.statistics()
        for (kind, t) in transcribers { speech[kind] = await t.statistics() }
        if let startedAt { elapsed = Date().timeIntervalSince(startedAt) }

        // Volatile text drives the overlay — it is the live edge of speech. Finalized
        // text is the transcript, and arrives later by design.
        if overlay.visible {
            let sys = speech[.system] ?? TranscriptStats()
            let mic = speech[.microphone] ?? TranscriptStats()
            let sysText = sys.lastVolatile.isEmpty ? sys.lastFinalized : sys.lastVolatile
            let micText = mic.lastVolatile.isEmpty ? mic.lastFinalized : mic.lastVolatile
            if mic.lastRangeEnd >= sys.lastRangeEnd, !micText.isEmpty {
                overlay.update(speaker: "YOU", text: micText)
            } else if !sysText.isEmpty {
                overlay.update(speaker: "SPEAKER", text: sysText)
            }
        }

        judge()
    }

    /// Gates are judged continuously so a run reports itself rather than needing
    /// a human to interpret the numbers afterwards.
    private func judge() {
        let sys = audio[.system] ?? SourceStats()
        let mic = audio[.microphone] ?? SourceStats()

        if sys.voicedSeconds > 1.5 { board.set("2", .pass, "\(String(format: "%.1f", sys.voicedSeconds))s of sound · \(sys.format) · \(sys.buffers) buffers") }
        if mic.voicedSeconds > 1.5 { board.set("3", .pass, "\(String(format: "%.1f", mic.voicedSeconds))s of sound · \(mic.format) · separable from system") }

        let s = speech[.system] ?? TranscriptStats()
        let m = speech[.microphone] ?? TranscriptStats()
        let both = (s.volatileResults + s.finalizedResults) > 0 && (m.volatileResults + m.finalizedResults) > 0
        if both { board.set("5", .pass, "system \(s.volatileResults)v/\(s.finalizedResults)f · mic \(m.volatileResults)v/\(m.finalizedResults)f") }

        if s.volatileResults > 0 && s.finalizedResults > 0 {
            board.set("6", .pass, "volatile \(s.volatileResults) superseded by \(s.finalizedResults) finalized · \(s.settleCalls) settle calls")
        }

        // Gate 8: both sources' ranges advance on one clock without going backwards.
        if s.finalizedResults > 0 || m.finalizedResults > 0 {
            let monotonic = s.monotonic && m.monotonic
            board.set("8", monotonic ? .pass : .fail,
                      "system \(String(format: "%.1f–%.1fs", s.lastRangeStart, s.lastRangeEnd)) · mic \(String(format: "%.1f–%.1fs", m.lastRangeStart, m.lastRangeEnd)) · monotonic: \(monotonic)")
        }

        if elapsed > 180, s.finalizedResults > 0 {
            board.set("7", .pass, "\(Int(elapsed))s continuous · \(s.finalizedResults) finalized, still producing")
        }

        if let e = s.error { board.set("5", .fail, "system transcriber: \(e)") }
        if let e = m.error { board.set("5", .fail, "mic transcriber: \(e)") }
    }

    func stop() async {
        guard running else { return }
        ticker?.invalidate(); ticker = nil

        let before = engine.running
        await engine.stop()
        for (_, t) in transcribers { await t.stop() }
        await refresh()
        running = false

        // Gate 13 is non-negotiable: Stop must always end capture.
        let released = before && !engine.running
        board.set("13", released ? .pass : .fail,
                  released ? "stream and microphone released" : "engine still reports running after stop")

        let s = speech[.system] ?? TranscriptStats()
        let m = speech[.microphone] ?? TranscriptStats()
        board.note("Stopped. system: \(s.finalizedResults) finalized · mic: \(m.finalizedResults) finalized", kind: .good)
        if !s.lastFinalized.isEmpty { board.note("  system last final: “\(s.lastFinalized.suffix(90))”") }
        if !m.lastFinalized.isEmpty { board.note("  mic last final: “\(m.lastFinalized.suffix(90))”") }
        if !s.lastVolatile.isEmpty { board.note("  system last volatile: “\(s.lastVolatile.suffix(90))”") }
        board.note("  settle calls — system \(s.settleCalls) · mic \(m.settleCalls)")
        for line in s.finalizedSamples { board.note("  system FINAL: \(line)") }
        for line in m.finalizedSamples { board.note("  mic FINAL: \(line)") }
    }
}
