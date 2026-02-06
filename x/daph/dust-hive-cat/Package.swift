// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "DustHiveCat",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "DustHiveCat",
            path: "DustHiveCat",
            resources: [
                .copy("Resources")
            ]
        )
    ]
)
