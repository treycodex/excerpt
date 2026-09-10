import SwiftUI

struct SpikeView: View {
    @StateObject private var board = GateBoard()
    @StateObject private var session: CaptureSession
    @State private var downloadProgress: Double?

    init() {
        let board = GateBoard()
        _board = StateObject(wrappedValue: board)
        _session = StateObject(wrappedValue: CaptureSession(board: board))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            gateList
            Divider()
            controls
            Divider()
            logView
        }
        .background(Color(red: 0.04, green: 0.04, blue: 0.04))
        .preferredColorScheme(.dark)
        .task {
            // --auto runs the gates that need no human in the loop, so a run can be
            // driven and read from a terminal. Permission gates still need clicks.
            guard CommandLine.arguments.contains("--auto") else { return }
            await runModel()
            await runPermissions()
            board.note("--auto complete; permission and capture gates need interaction.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("EXCERPT")
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .tracking(4)
                .foregroundStyle(.secondary)
            Text("Stage 0 gate")
                .font(.system(size: 22, weight: .regular, design: .serif))
        }
        .padding(20)
    }

    private var gateList: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(board.gates) { gate in
                    HStack(alignment: .top, spacing: 12) {
                        Text(gate.id)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .frame(width: 24, alignment: .leading)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(gate.title)
                                .font(.system(size: 12, design: .monospaced))
                            Text(gate.detail)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer()
                        Text(gate.status.rawValue)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(colour(for: gate.status))
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 9)
                    Divider().opacity(0.25)
                }
            }
        }
        .frame(maxHeight: 300)
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Button("1 · Model") { Task { await runModel() } }
                Button("4 · Permissions") { Task { await runPermissions() } }
                if session.running {
                    Button("Stop capture") { Task { await session.stop() } }
                } else {
                    Button("2·3·5·6·8 · Start capture") { Task { await session.start() } }
                }
                Button("Export results") { export() }
            }
            if session.running || !session.audio.isEmpty { liveStats }
            if let p = downloadProgress {
                ProgressView(value: p) {
                    Text("Downloading speech model — \(Int(p * 100))%")
                        .font(.system(size: 11, design: .monospaced))
                }
                .frame(maxWidth: 320)
            }
        }
        .padding(20)
    }

    /// Live per-source health while capturing. Without this, "no captions" could be a
    /// silent source, a dead recogniser or a quiet room, and they look identical.
    private var liveStats: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(String(format: "elapsed %.0fs", session.elapsed))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.tertiary)
            ForEach(SourceKind.allCases, id: \.self) { kind in
                let a = session.audio[kind] ?? SourceStats()
                let s = session.speech[kind] ?? TranscriptStats()
                HStack(alignment: .top, spacing: 10) {
                    Text(kind.rawValue)
                        .font(.system(size: 11, design: .monospaced))
                        .frame(width: 110, alignment: .leading)
                    meter(a.level)
                    Text(String(format: "%.1fs sound · %d vol · %d final · %@",
                                a.voicedSeconds, s.volatileResults, s.finalizedResults, a.format))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(a.voicedSeconds > 1 ? .secondary : .tertiary)
                }
                if !s.lastVolatile.isEmpty || !s.lastFinalized.isEmpty {
                    Text(s.lastFinalized.isEmpty ? s.lastVolatile : s.lastFinalized)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .padding(.leading, 120)
                }
            }
        }
        .padding(.top, 4)
    }

    private func meter(_ level: Float) -> some View {
        HStack(spacing: 2) {
            ForEach(0..<6, id: \.self) { i in
                Rectangle()
                    .fill(Float(i) < level * 90 ? Color(red: 1.0, green: 0.30, blue: 0.06) : Color.gray.opacity(0.3))
                    .frame(width: 3, height: CGFloat(4 + i * 2))
            }
        }
        .frame(width: 34, alignment: .leading)
    }

    private var logView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(board.log) { line in
                        Text(line.text)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(colour(for: line.kind))
                            .textSelection(.enabled)
                            .id(line.id)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
            .onChange(of: board.log.count) {
                if let last = board.log.last { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
        .frame(minHeight: 180)
    }

    // MARK: - runs

    private func runModel() async {
        board.set("1", .running)
        board.note("Inspecting speech model availability…")

        let before = await ModelProvisioning.inspect()
        board.note("  supported: \(before.localeSupported) · installed: \(before.localeInstalled) · status: \(before.statusBefore)")

        let report = await ModelProvisioning.install { fraction in
            Task { @MainActor in downloadProgress = fraction < 1 ? fraction : nil }
        }
        downloadProgress = nil

        if let error = report.error {
            board.set("1", .fail, "error: \(error)")
            board.note("  FAILED — \(error)", kind: .bad)
            return
        }

        var parts = ["installed: \(report.localeInstalled)"]
        if report.installationRan {
            parts.append(String(format: "install request %.1fs", report.downloadSeconds))
        }
        parts.append("reserved: \(report.reservedLocales)")
        parts.append("status: \(report.statusAfter)")
        let detail = parts.joined(separator: " · ")

        board.note("  reservedLocales: \(report.reservedLocales) (max \(report.maximumReserved))")
        if let n = report.reserveNote { board.note("  note: \(n)") }
        if let e = report.reserveError { board.note("  reserve threw: \(e)", kind: .bad) }
        board.set("1", report.passes ? .pass : .fail, detail)
        board.note("  \(detail)", kind: report.passes ? .good : .bad)
        board.note("  Offline check still owed: disable networking and re-run before calling gate 1 passed.")
    }

    private func runPermissions() async {
        board.set("4", .running)
        var states: [String] = []
        var allGranted = true

        for permission in Permission.allCases {
            var state = await Permissions.state(of: permission)
            board.note("\(permission.rawValue): \(state.rawValue)")
            if state == .undetermined || state == .denied {
                board.note("  requesting \(permission.rawValue)…")
                state = await Permissions.request(permission)
                board.note("  → \(state.rawValue)", kind: state == .granted ? .good : .bad)
            }
            states.append("\(permission.rawValue): \(state.rawValue)")
            if state != .granted { allGranted = false }
        }

        if !allGranted {
            board.note("  Screen recording only takes effect after a relaunch — quit and reopen, then re-check.", kind: .bad)
        }
        board.set("4", allGranted ? .pass : .fail, states.joined(separator: " · "))
    }

    private func export() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "SPIKE-RESULTS.md"
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            try? board.exportable.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    // MARK: - colour

    private func colour(for status: Gate.Status) -> Color {
        switch status {
        case .pending: return .secondary
        case .running: return Color(red: 0.91, green: 0.78, blue: 0.48)
        case .pass: return Color(red: 0.36, green: 0.82, blue: 0.54)
        case .fail: return Color(red: 1.0, green: 0.30, blue: 0.30)
        case .inconclusive: return Color(red: 0.91, green: 0.78, blue: 0.48)
        }
    }

    private func colour(for kind: LogLine.Kind) -> Color {
        switch kind {
        case .plain: return .secondary
        case .good: return Color(red: 0.36, green: 0.82, blue: 0.54)
        case .bad: return Color(red: 1.0, green: 0.30, blue: 0.30)
        }
    }
}
