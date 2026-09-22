import AVFoundation
import ScreenCaptureKit

enum SourceKind: String, CaseIterable, Sendable {
    case system = "System audio"      // everyone else
    case microphone = "Microphone"    // you

    /// What to call this source when speaking to the person using it, rather than
    /// in a diagnostic line. "System audio" is what we capture; "the meeting" is
    /// what they are listening to.
    var sourceName: String {
        switch self {
        case .system: return "Meeting audio"
        case .microphone: return "Your microphone"
        }
    }
}

/// Per-source health. The web build proved that without these, "no captions" is
/// indistinguishable from a silent track, a dead recogniser, or a quiet room.
struct SourceStats: Sendable {
    var buffers = 0
    var frames = 0
    var level: Float = 0
    var voicedSeconds: Double = 0
    var lastError: String?
    var format: String = "—"
}

/// The session's capture boundary. Production uses `CaptureEngine`; lifecycle tests
/// inject a deterministic source so they never need Screen Recording permission or
/// a real display just to exercise start/stop/error ordering.
protocol MeetingCapturing: AnyObject {
    func statistics() -> [SourceKind: SourceStats]
    func start(
        onBuffer: @escaping (SourceKind, AVAudioPCMBuffer, CMTime) -> Void,
        onStreamError: @escaping (String) -> Void
    ) async throws
    func stop() async
}

/// One SCStream, two audio outputs. System audio and microphone arrive separately,
/// which is the whole basis for telling you from everyone else.
final class CaptureEngine: NSObject, SCStreamOutput, SCStreamDelegate, MeetingCapturing, @unchecked Sendable {

    private var stream: SCStream?
    private let queue = DispatchQueue(label: "com.excerpt.capture", qos: .userInitiated)
    private let lock = NSLock()
    private var stats: [SourceKind: SourceStats] = [:]
    private var onBuffer: ((SourceKind, AVAudioPCMBuffer, CMTime) -> Void)?
    private var onStreamError: ((String) -> Void)?
    private let selectedMicrophoneID: () throws -> String

    init(selectedMicrophoneID: @escaping () throws -> String = {
        guard let id = AVCaptureDevice.default(for: .audio)?.uniqueID else {
            throw MicrophoneSelectionError.unavailable
        }
        return id
    }) {
        self.selectedMicrophoneID = selectedMicrophoneID
        super.init()
    }

    /// Whether any capture resource is still held. Gate 13 must be judged on this,
    /// not on observing a running→stopped transition: after an interruption the
    /// engine is already stopped, and a transition-based check reports a false
    /// failure for a stop that worked correctly.
    var holdsResources: Bool { stream != nil }

    /// True between a successful start and a completed stop. Gate 13 depends on this
    /// being honest: Stop must always release the microphone and the stream.
    private(set) var running = false

    func statistics() -> [SourceKind: SourceStats] {
        lock.lock(); defer { lock.unlock() }
        return stats
    }

    func start(
        onBuffer: @escaping (SourceKind, AVAudioPCMBuffer, CMTime) -> Void,
        onStreamError: @escaping (String) -> Void
    ) async throws {
        self.onBuffer = onBuffer
        self.onStreamError = onStreamError
        lock.withLock { stats = [.system: SourceStats(), .microphone: SourceStats()] }

        let microphoneID = try selectedMicrophoneID()
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "Excerpt", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "No display available to attach the stream to"])
        }

        // We want audio, not pictures. A tiny video region is still required because
        // SCStream is a screen-capture API; keeping it minimal keeps the cost near zero.
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true      // never transcribe our own sounds
        config.captureMicrophone = true                // separate microphone output
        config.microphoneCaptureDeviceID = microphoneID
        config.sampleRate = 48_000
        config.channelCount = 1
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try stream.addStreamOutput(self, type: .microphone, sampleHandlerQueue: queue)
        self.stream = stream
        do {
            try await stream.startCapture()
        } catch {
            if self.stream === stream { self.stream = nil }
            throw error
        }
        // `stop()` can run while startCapture is suspended. Do not publish a late
        // successful start after that meeting has already entered finishing.
        guard self.stream === stream else {
            try? await stream.stopCapture()
            throw CancellationError()
        }
        running = true
    }

    /// Simulates an interruption: the stream dies without going through stop().
    /// Gate 12 asks whether transcript captured so far survives that.
    func simulateInterruption() async {
        guard let stream else { return }
        self.stream = nil
        running = false
        try? await stream.stopCapture()
        onStreamError?("stream interrupted (simulated)")
    }

    /// Gate 13: always ends capture and releases every resource, even if the stream
    /// is already unhealthy.
    func stop() async {
        running = false
        guard let stream else {
            onBuffer = nil
            onStreamError = nil
            return
        }
        self.stream = nil
        onBuffer = nil
        onStreamError = nil
        do { try await stream.stopCapture() } catch { /* already stopped or dead */ }
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard self.stream === stream else { return }
        let kind: SourceKind
        switch type {
        case .audio: kind = .system
        case .microphone: kind = .microphone
        default: return
        }
        guard sampleBuffer.isValid, let pcm = Self.pcmBuffer(from: sampleBuffer) else { return }

        let frames = Int(pcm.frameLength)
        let level = Self.rms(of: pcm)
        let seconds = Double(frames) / pcm.format.sampleRate

        lock.lock()
        stats[kind, default: SourceStats()].buffers += 1
        stats[kind, default: SourceStats()].frames += frames
        stats[kind, default: SourceStats()].level = level
        stats[kind, default: SourceStats()].format =
            "\(Int(pcm.format.sampleRate))Hz ×\(pcm.format.channelCount)"
        if level > 0.01 { stats[kind, default: SourceStats()].voicedSeconds += seconds }
        lock.unlock()

        onBuffer?(kind, pcm, sampleBuffer.presentationTimeStamp)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        guard self.stream === stream else { return }
        self.stream = nil
        running = false
        lock.lock()
        for kind in SourceKind.allCases { stats[kind, default: SourceStats()].lastError = "\(error)" }
        lock.unlock()
        onStreamError?("stream stopped: \(error.localizedDescription)")
    }

    // MARK: - conversion

    /// CMSampleBuffer → AVAudioPCMBuffer, deep-copied. The buffer list points at
    /// memory owned by the sample buffer, which is gone by the time the analyzer
    /// reads it asynchronously.
    static func pcmBuffer(from sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard let description = sampleBuffer.formatDescription,
              let asbd = description.audioStreamBasicDescription else { return nil }
        var streamDescription = asbd
        guard let format = AVAudioFormat(streamDescription: &streamDescription) else { return nil }

        let frames = AVAudioFrameCount(sampleBuffer.numSamples)
        guard frames > 0, let copy = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        copy.frameLength = frames

        do {
            try sampleBuffer.withAudioBufferList { list, _ in
                guard let source = list.unsafePointer.pointee.mBuffers.mData,
                      let destination = copy.audioBufferList.pointee.mBuffers.mData else { return }
                let bytes = min(list.unsafePointer.pointee.mBuffers.mDataByteSize,
                                copy.audioBufferList.pointee.mBuffers.mDataByteSize)
                memcpy(destination, source, Int(bytes))
            }
        } catch {
            return nil
        }
        return copy
    }

    static func rms(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<count { sum += channel[i] * channel[i] }
        return (sum / Float(count)).squareRoot()
    }
}
