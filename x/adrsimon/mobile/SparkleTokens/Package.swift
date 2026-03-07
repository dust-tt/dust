// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "SparkleTokens",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "SparkleTokens",
            targets: ["SparkleTokens"]
        ),
    ],
    targets: [
        .target(
            name: "SparkleTokens",
            resources: [
                .process("Resources"),
            ]
        ),
    ]
)
