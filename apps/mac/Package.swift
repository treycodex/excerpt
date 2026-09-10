// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Excerpt",
    platforms: [.macOS("26.0")],
    targets: [
        .executableTarget(
            name: "Excerpt",
            path: "Sources/Excerpt",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "ExcerptTests",
            dependencies: ["Excerpt"],
            path: "Tests/ExcerptTests",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
