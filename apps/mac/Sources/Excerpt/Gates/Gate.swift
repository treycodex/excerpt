import Foundation

/// One Stage 0 criterion. The web spike proved that a harness which records what was
/// *measured* — rather than what was assumed — is what catches the real bugs.
@MainActor
final class GateBoard: ObservableObject {
    @Published var gates: [Gate]
    @Published var log: [LogLine] = []

    init() {
        gates = Gate.stage0
    }

    func set(_ id: String, _ status: Gate.Status, _ detail: String? = nil) {
        print("[gate \(id)] \(status.rawValue)\(detail.map { " — " + $0 } ?? "")")
        fflush(stdout)
        guard let i = gates.firstIndex(where: { $0.id == id }) else { return }
        gates[i].status = status
        if let detail { gates[i].detail = detail }
    }

    func note(_ text: String, kind: LogLine.Kind = .plain) {
        // Mirrored to stdout so a run can be read from a terminal rather than
        // relayed by hand from the window.
        print("[spike] \(text)")
        fflush(stdout)
        log.append(LogLine(text: text, kind: kind))
        if log.count > 400 { log.removeFirst(log.count - 400) }
    }

    var exportable: String {
        let stamp = ISO8601DateFormatter().string(from: Date())
        var out = "Excerpt — Stage 0 gate\n\(stamp)\n\n"
        for g in gates {
            out += "\(g.id.padding(toLength: 4, withPad: " ", startingAt: 0)) \(g.status.rawValue.padding(toLength: 12, withPad: " ", startingAt: 0)) \(g.title)\n"
            if !g.detail.isEmpty { out += "     \(g.detail)\n" }
        }
        out += "\n--- log ---\n"
        for l in log { out += l.text + "\n" }
        return out
    }
}

struct LogLine: Identifiable {
    enum Kind { case plain, good, bad }
    let id = UUID()
    let text: String
    let kind: Kind
}

struct Gate: Identifiable {
    enum Status: String { case pending, running, pass, fail, inconclusive }

    let id: String
    let title: String
    var detail: String
    var status: Status = .pending

    static let stage0: [Gate] = [
        Gate(id: "1",  title: "Speech model provisioning", detail: "supported/installed checked, download with progress, works offline after"),
        Gate(id: "2",  title: "System audio capture",      detail: "far-side audio on SCStreamOutputTypeAudio"),
        Gate(id: "3",  title: "Microphone capture",        detail: "mic on SCStreamOutputTypeMicrophone, separable from 2"),
        Gate(id: "4",  title: "Three authorizations",      detail: "mic, screen recording, speech — each independent"),
        Gate(id: "5",  title: "Two transcribers",          detail: "both sources on-device, concurrently"),
        Gate(id: "6",  title: "Volatile → finalized",      detail: "volatile superseded; finalized text stable"),
        Gate(id: "7",  title: "Continuous speech",         detail: "3+ min, no starvation, no unbounded volatile growth"),
        Gate(id: "8",  title: "Shared timeline",           detail: "both streams on one clock, monotonic"),
        Gate(id: "9",  title: "Overlay over fullscreen",   detail: "transparent, no box, readable over fullscreen meeting"),
        Gate(id: "10", title: "Click-through",             detail: "clicks reach the meeting underneath"),
        Gate(id: "11", title: "Multi-monitor + Spaces",    detail: "overlay follows or is placed sensibly"),
        Gate(id: "12", title: "Interrupt / sleep-wake",    detail: "NON-NEGOTIABLE: no silent transcript loss"),
        Gate(id: "13", title: "Stop is reliable",          detail: "NON-NEGOTIABLE: always releases mic and stream"),
        Gate(id: "14", title: "Unsigned rebuild",          detail: "experiment: do TCC grants survive a rebuild?"),
    ]
}

