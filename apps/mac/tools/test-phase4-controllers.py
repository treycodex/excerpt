#!/usr/bin/env python3
"""Run the macro-independent Phase 4 tests against unchanged production sources.

This supplements, and never replaces, `swift test` on the complete app. The bridge,
setup flow and lifecycle integration tests still require the full Xcode toolchain.
No capture devices, permissions, production meetings or app windows are used.
"""
from pathlib import Path
import argparse
import os
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--build-only", action="store_true", help="Compile controllers without the Swift Testing module")
args = parser.parse_args()

mac = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="excerpt-phase4-controllers-", dir="/private/tmp") as scratch:
    root = Path(scratch)
    source = root / "Sources" / "Excerpt"
    tests = root / "Tests" / "ExcerptTests"
    source.mkdir(parents=True)
    tests.mkdir(parents=True)
    for relative in [
        "Core/Models.swift", "App/DesktopSettings.swift", "App/DockPresence.swift",
        "Capture/MicrophoneSettings.swift", "Capture/CaptureEngine.swift", "Capture/SourceHealth.swift",
        "Captions/CaptionStyle.swift", "Captions/CaptionTokens.generated.swift",
        "Captions/CaptionOverlayView.swift", "Captions/OverlayWindow.swift", "Captions/SubtitlePresentation.swift",
        "Speech/SourceTranscriber.swift", "Captions/CaptionEdge.swift",
        "Meeting/MeetingCommandCoordinator.swift", "Review/MeetingShortcuts.swift", "Setup/InputCheck.swift",
    ]:
        original = mac / "Sources" / "Excerpt" / relative
        (source / original.name).symlink_to(original)
    original = mac / "Tests" / "ExcerptTests" / "Phase4DesktopSettingsTests.swift"
    (tests / original.name).symlink_to(original)
    (root / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ExcerptPhase4Controllers", platforms: [.macOS("26.0")], targets: [
    .target(name: "Excerpt", swiftSettings: [.swiftLanguageMode(.v5)]),
    .testTarget(name: "ExcerptTests", dependencies: ["Excerpt"], swiftSettings: [.swiftLanguageMode(.v5)])
])
''')
    env = dict(os.environ, CLANG_MODULE_CACHE_PATH="/private/tmp/excerpt-phase4-controller-clang")
    result = subprocess.run([
        "swift", "build" if args.build_only else "test", "--package-path", str(root), "--disable-sandbox",
        "--cache-path", "/private/tmp/excerpt-phase4-controller-swift-cache",
    ], env=env)
    raise SystemExit(result.returncode)
