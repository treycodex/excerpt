// Waits until a process whose bundle identifier starts with the argument is taking
// microphone input (a call app joining), then exits. Starts the call take hands-free.
import CoreAudio
import Foundation
let want = (CommandLine.arguments.dropFirst().first ?? "com.google.Chrome").lowercased()
func addr(_ s: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    .init(mSelector: s, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}
func inputUsers() -> [String] {
    var list = addr(kAudioHardwarePropertyProcessObjectList); var size: UInt32 = 0
    let system = AudioObjectID(kAudioObjectSystemObject)
    AudioObjectGetPropertyDataSize(system, &list, 0, nil, &size)
    var objects = [AudioObjectID](repeating: 0, count: Int(size) / 4)
    AudioObjectGetPropertyData(system, &list, 0, nil, &size, &objects)
    return objects.compactMap { object in
        var running = addr(kAudioProcessPropertyIsRunningInput); var value: UInt32 = 0; var n = UInt32(4)
        guard AudioObjectGetPropertyData(object, &running, 0, nil, &n, &value) == noErr, value == 1 else { return nil }
        var bundle = addr(kAudioProcessPropertyBundleID); var id: Unmanaged<CFString>?
        var m = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        _ = withUnsafeMutablePointer(to: &id) { AudioObjectGetPropertyData(object, &bundle, 0, nil, &m, $0) }
        return (id?.takeRetainedValue() as String?)?.lowercased()
    }
}
while !inputUsers().contains(where: { $0.hasPrefix(want) }) { Thread.sleep(forTimeInterval: 0.2) }
print("mic taken by \(want)")
