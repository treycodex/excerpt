import CoreMedia
import Foundation

/// The one timeline both streams land on.
///
/// Each `SpeechAnalyzer` counts from the first frame *it* was fed, in *its* own
/// format, so "1.4 seconds" means a different moment on each source. What relates
/// them is the capture clock: the presentation timestamp of each source's first
/// buffer. Subtract the meeting's origin from that and you have the offset to add to
/// every local range — which is the whole of gate 8, and the reason evidence
/// scrubbing can be trusted to land on the words it quotes.
///
/// A value type on purpose: a clock that can be copied and compared is a clock that
/// can be written into a journal entry and checked afterwards.
struct MeetingClock: Sendable, Equatable {
    /// Wall-clock start, for the meeting's own record. Not used for alignment.
    let startedAt: Date

    /// Capture-clock time of the first audio buffer of the meeting, from whichever
    /// source produced one first.
    private(set) var origin: CMTime?

    init(startedAt: Date = Date()) {
        self.startedAt = startedAt
    }

    /// The first buffer to arrive defines zero. Later calls are ignored, including
    /// the other source's first buffer — that one is late by exactly the amount this
    /// clock exists to measure.
    mutating func adopt(firstBufferAt time: CMTime) {
        guard origin == nil, time.isValid, time.isNumeric else { return }
        origin = time
    }

    /// Seconds between the meeting's zero and where this source began.
    func offsetSeconds(forSourceStartingAt sourceStart: CMTime) -> Double {
        guard let origin, sourceStart.isValid, sourceStart.isNumeric else { return 0 }
        let offset = (sourceStart - origin).seconds
        // A negative offset would mean a source started before the meeting did. It
        // cannot, and treating it as zero is better than emitting a range that runs
        // backwards past the start of the recording.
        return offset.isFinite && offset > 0 ? offset : 0
    }

    /// A source-local range placed on the meeting's timeline.
    func meetingRange(
        localStart: Double,
        localEnd: Double,
        sourceStartingAt sourceStart: CMTime
    ) -> (start: Double, end: Double) {
        let offset = offsetSeconds(forSourceStartingAt: sourceStart)
        return (localStart + offset, localEnd + offset)
    }

    /// Milliseconds since the meeting began — the field the website calls `tArrived`.
    /// On macOS this is still arrival time; the audio-aligned answer is `tStart`.
    func arrivedMilliseconds(at moment: Date = Date()) -> Double {
        max(0, moment.timeIntervalSince(startedAt) * 1000)
    }
}
