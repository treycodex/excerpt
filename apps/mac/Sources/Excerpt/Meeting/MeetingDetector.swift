import AppKit
import CoreAudio
import Darwin
import ScreenCaptureKit

/// A call app Excerpt knows by its bundle identifier.
///
/// Audio is often opened by a helper rather than the app itself — Chrome's audio
/// service, Slack's renderer, WebKit's GPU process for Safari — so a match covers the
/// identifier and anything nested under it. `windowOwners` are the bundles whose window
/// titles may name the meeting, which for a browser is the browser, not its helper.
struct MeetingApp: Hashable, Sendable {
    var name: String
    var bundleIDs: [String]
    var windowOwners: [String]
    var isBrowser = false

    /// Case is ignored: Arc's own process is `company.thebrowser.Browser` but its
    /// audio helper reports `company.thebrowser.browser.helper`.
    func matches(_ bundleID: String) -> Bool {
        let id = bundleID.lowercased()
        return bundleIDs.contains { id == $0.lowercased() || id.hasPrefix($0.lowercased() + ".") }
    }

    static let known: [MeetingApp] = [
        MeetingApp(name: "Zoom", bundleIDs: ["us.zoom.xos"], windowOwners: ["us.zoom.xos"]),
        MeetingApp(name: "Microsoft Teams", bundleIDs: ["com.microsoft.teams2", "com.microsoft.teams"],
                   windowOwners: ["com.microsoft.teams2", "com.microsoft.teams"]),
        MeetingApp(name: "Webex", bundleIDs: ["Cisco-Systems.Spark", "com.webex.meetingmanager"],
                   windowOwners: ["Cisco-Systems.Spark", "com.webex.meetingmanager"]),
        MeetingApp(name: "FaceTime", bundleIDs: ["com.apple.FaceTime", "com.apple.avconferenced"],
                   windowOwners: ["com.apple.FaceTime"]),
        MeetingApp(name: "Slack", bundleIDs: ["com.tinyspeck.slackmacgap"], windowOwners: ["com.tinyspeck.slackmacgap"]),
        MeetingApp(name: "Discord", bundleIDs: ["com.hnc.Discord"], windowOwners: ["com.hnc.Discord"]),
        MeetingApp(name: "Chrome", bundleIDs: ["com.google.Chrome"], windowOwners: ["com.google.Chrome"], isBrowser: true),
        MeetingApp(name: "Safari", bundleIDs: ["com.apple.Safari", "com.apple.WebKit.GPU"],
                   windowOwners: ["com.apple.Safari"], isBrowser: true),
        MeetingApp(name: "Arc", bundleIDs: ["company.thebrowser.Browser"],
                   windowOwners: ["company.thebrowser.Browser"], isBrowser: true),
        MeetingApp(name: "Dia", bundleIDs: ["company.thebrowser.dia"], windowOwners: ["company.thebrowser.dia"], isBrowser: true),
        MeetingApp(name: "Edge", bundleIDs: ["com.microsoft.edgemac"], windowOwners: ["com.microsoft.edgemac"], isBrowser: true),
        MeetingApp(name: "Brave", bundleIDs: ["com.brave.Browser"], windowOwners: ["com.brave.Browser"], isBrowser: true),
        MeetingApp(name: "Firefox", bundleIDs: ["org.mozilla.firefox"], windowOwners: ["org.mozilla.firefox"], isBrowser: true),
    ]

    static func matching(_ bundleID: String) -> MeetingApp? {
        known.first { $0.matches(bundleID) }
    }
}

/// A meeting's name, when a window already says it.
///
/// Deliberately narrow. Zoom's windows say "Zoom Meeting" whatever the meeting is; a
/// Meet tab says "Meet – <event>" only when joined from a calendar event, and a meeting
/// code otherwise. A wrong name typed into the prompt costs more than an empty field,
/// because an empty field still gets named from the transcript at End.
enum MeetingTitleGuess {
    private static let browserSuffixes = [
        " - Google Chrome", " – Google Chrome", " - Microsoft Edge", " — Mozilla Firefox",
        " - Mozilla Firefox", " - Brave", " - Arc", " - Audio playing",
        " - Camera and microphone recording", " - Microphone recording",
    ]
    private static let generic: Set<String> = [
        "zoom", "zoom meeting", "zoom workplace", "zoom webinar", "microsoft teams", "teams",
        "chat", "calendar", "activity", "calls", "files", "home", "meet", "google meet",
        "meeting", "meetings", "webex", "facetime", "slack", "discord", "new tab", "untitled",
    ]

    static func guess(from titles: [String]) -> String? {
        for title in titles {
            if let name = name(in: title) { return name }
        }
        return nil
    }

    static func name(in window: String) -> String? {
        var title = window.trimmingCharacters(in: .whitespacesAndNewlines)
        var stripped = true
        while stripped {
            stripped = false
            for suffix in browserSuffixes where title.hasSuffix(suffix) {
                title = String(title.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
                stripped = true
            }
            let bare = droppingIndicators(title)
            if bare != title {
                title = bare
                stripped = true
            }
        }

        // Google Meet: "Meet – Weekly sync" or "Meet - abc-defg-hij".
        if let match = title.wholeMatch(of: #/Meet\s*[-–—]\s*(.+)/#) {
            return usable(String(match.1))
        }
        // Teams, desktop or web: "Weekly sync | Microsoft Teams", sometimes with a
        // section in between ("Meeting | Weekly sync | Microsoft Teams").
        let parts = title.components(separatedBy: " | ").map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count > 1, parts.last == "Microsoft Teams" {
            return parts.dropLast().lazy.compactMap(usable).first
        }
        return nil
    }

    /// Browsers mark a tab that is playing or recording in its title — Chrome puts a
    /// speaker (🔊) after it, others a red dot — and the mark is no part of the name.
    /// Left on, it also hides a Meet code from the check below.
    private static func droppingIndicators(_ title: String) -> String {
        func isIndicator(_ character: Character) -> Bool {
            character.isWhitespace || character.unicodeScalars.contains {
                $0.properties.isEmojiPresentation || $0.properties.generalCategory == .otherSymbol
            }
        }
        var bare = Substring(title)
        while let last = bare.last, isIndicator(last) { bare = bare.dropLast() }
        while let first = bare.first, isIndicator(first) { bare = bare.dropFirst() }
        return String(bare)
    }

    private static func usable(_ candidate: String) -> String? {
        let name = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...80).contains(name.count), !generic.contains(name.lowercased()) else { return nil }
        // A Meet code is not a name.
        guard name.wholeMatch(of: #/[a-z]{3}-[a-z]{4}-[a-z]{3}/#) == nil else { return nil }
        return name
    }

    /// Window titles for the app, read through the Screen Recording grant Excerpt
    /// already holds for meeting audio. Without that grant it reads nothing, and it
    /// never asks: `SCShareableContent` is not a way to request the permission.
    @MainActor
    static func windowTitles(for app: MeetingApp) async -> [String] {
        guard CGPreflightScreenCaptureAccess(),
              let content = try? await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: false)
        else { return [] }
        return content.windows
            .filter { window in app.windowOwners.contains { window.owningApplication?.bundleIdentifier == $0 } }
            .compactMap(\.title)
            .filter { !$0.isEmpty }
    }
}

/// Which processes other than Excerpt are taking microphone input.
///
/// Core Audio's process objects report this directly, and notify on change, so
/// nothing polls: with no meeting on, the watcher costs nothing. Excerpt's own input —
/// a meeting, or setup's input check — is excluded by process id, so starting a
/// transcript never looks like another app joining.
final class MicrophoneInputWatcher: @unchecked Sendable {
    struct Use: Hashable, Sendable {
        var pid: pid_t
        var bundleID: String
    }

    private let queue = DispatchQueue(label: "com.excerpt.meeting-detection")
    private var listeners: [AudioObjectID: AudioObjectPropertyListenerBlock] = [:]
    private var listListener: AudioObjectPropertyListenerBlock?
    private var onChange: (@MainActor ([Use]) -> Void)?
    private let ownPID = getpid()

    private var processList = MicrophoneInputWatcher.address(kAudioHardwarePropertyProcessObjectList)
    private var runningInput = MicrophoneInputWatcher.address(kAudioProcessPropertyIsRunningInput)

    func start(onChange: @escaping @MainActor ([Use]) -> Void) {
        queue.async { [self] in
            guard listListener == nil else { return }
            self.onChange = onChange
            let block: AudioObjectPropertyListenerBlock = { [weak self] _, _ in self?.rescan() }
            if AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject),
                                                   &processList, queue, block) == noErr {
                listListener = block
            }
            rescan()
        }
    }

    func stop() {
        queue.async { [self] in
            if let listListener {
                AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject),
                                                       &processList, queue, listListener)
            }
            listListener = nil
            for (object, block) in listeners {
                AudioObjectRemovePropertyListenerBlock(object, &runningInput, queue, block)
            }
            listeners = [:]
            onChange = nil
        }
    }

    /// On `queue`. Follows the process list, listening to each process's input flag.
    private func rescan() {
        guard let onChange else { return }
        let objects = Self.processObjects()
        let current = Set(objects)
        for (object, block) in listeners where !current.contains(object) {
            AudioObjectRemovePropertyListenerBlock(object, &runningInput, queue, block)
            listeners[object] = nil
        }
        for object in objects where listeners[object] == nil {
            let block: AudioObjectPropertyListenerBlock = { [weak self] _, _ in self?.report() }
            if AudioObjectAddPropertyListenerBlock(object, &runningInput, queue, block) == noErr {
                listeners[object] = block
            }
        }
        report(objects: objects, onChange: onChange)
    }

    private func report() {
        guard let onChange else { return }
        report(objects: Array(listeners.keys), onChange: onChange)
    }

    private func report(objects: [AudioObjectID], onChange: @escaping @MainActor ([Use]) -> Void) {
        var uses: [Use] = []
        for object in objects where Self.uint32(object, kAudioProcessPropertyIsRunningInput) == 1 {
            guard let pid = Self.pid(object), pid != ownPID else { continue }
            let bundleID = Self.bundleID(object)
                ?? NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
            guard let bundleID, !bundleID.isEmpty else { continue }
            uses.append(Use(pid: pid, bundleID: bundleID))
        }
        Task { @MainActor in onChange(uses) }
    }

    private static func processObjects() -> [AudioObjectID] {
        let system = AudioObjectID(kAudioObjectSystemObject)
        var processList = address(kAudioHardwarePropertyProcessObjectList)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(system, &processList, 0, nil, &size) == noErr, size > 0 else { return [] }
        var objects = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(system, &processList, 0, nil, &size, &objects) == noErr else { return [] }
        return objects
    }

    private static func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
                                   mElement: kAudioObjectPropertyElementMain)
    }

    private static func uint32(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> UInt32? {
        var address = address(selector)
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr ? value : nil
    }

    private static func pid(_ object: AudioObjectID) -> pid_t? {
        var address = address(kAudioProcessPropertyPID)
        var value: pid_t = 0
        var size = UInt32(MemoryLayout<pid_t>.size)
        return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr ? value : nil
    }

    private static func bundleID(_ object: AudioObjectID) -> String? {
        var address = address(kAudioProcessPropertyBundleID)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        let status = withUnsafeMutablePointer(to: &value) {
            AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0)
        }
        guard status == noErr, let value else { return nil }
        let bundleID = value.takeRetainedValue() as String
        return bundleID.isEmpty ? nil : bundleID
    }
}

/// Turns microphone use into meeting edges: a call app began, or stopped, using the
/// microphone.
///
/// Both edges are held before they count. A call app briefly opens the microphone on
/// launch or while switching devices, and a prompt for that is noise. Release waits
/// longer than start, because some apps let go of the device while muted and taking
/// it back should read as the same meeting continuing.
@MainActor
final class MeetingDetector {
    enum Edge: Equatable {
        case began(MeetingApp)
        case ended(MeetingApp)
    }

    var onEdge: ((Edge) -> Void)?

    /// Call apps whose microphone use has settled on, in the order they began.
    private(set) var active: [MeetingApp] = []
    private var using: Set<MeetingApp> = []
    private var pending: [MeetingApp: Task<Void, Never>] = [:]
    private let beginDelay: Duration
    private let endDelay: Duration
    private let watcher: MicrophoneInputWatcher?

    init(beginDelay: Duration = .seconds(2), endDelay: Duration = .seconds(5),
         watcher: MicrophoneInputWatcher? = MicrophoneInputWatcher()) {
        self.beginDelay = beginDelay
        self.endDelay = endDelay
        self.watcher = watcher
    }

    private(set) var isRunning = false

    func start() {
        guard !isRunning else { return }
        isRunning = true
        watcher?.start { [weak self] uses in self?.update(uses.map(\.bundleID)) }
    }

    /// Stops listening and forgets every app, without reporting any as ended.
    func stop() {
        guard isRunning else { return }
        isRunning = false
        watcher?.stop()
        for task in pending.values { task.cancel() }
        pending = [:]
        using = []
        active = []
    }

    /// The bundle identifiers currently taking microphone input.
    func update(_ bundleIDs: [String]) {
        let now = Set(bundleIDs.compactMap(MeetingApp.matching))
        guard now != using else { return }
        using = now
        for app in Set(active).union(now).union(pending.keys) {
            let wanted = now.contains(app)
            if wanted == active.contains(app) {
                pending.removeValue(forKey: app)?.cancel()
                continue
            }
            guard pending[app] == nil else { continue }
            let delay = wanted ? beginDelay : endDelay
            pending[app] = Task { [weak self] in
                try? await Task.sleep(for: delay)
                guard !Task.isCancelled else { return }
                self?.settle(app)
            }
        }
    }

    private func settle(_ app: MeetingApp) {
        pending[app] = nil
        if using.contains(app), !active.contains(app) {
            active.append(app)
            onEdge?(.began(app))
        } else if !using.contains(app), let index = active.firstIndex(of: app) {
            active.remove(at: index)
            onEdge?(.ended(app))
        }
    }
}
