// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ExcerptSpike",
    platforms: [.macOS("26.0")],
    targets: [
        .executableTarget(
            name: "ExcerptSpike",
            path: "Sources/ExcerptSpike",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "ExcerptSpikeTests",
            dependencies: ["ExcerptSpike"],
            path: "Tests/ExcerptSpikeTests",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
