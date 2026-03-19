// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "StrasberryCapacitorCast",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "StrasberryCapacitorCast",
            targets: ["CastPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "CastPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/CastPlugin"),
        .testTarget(
            name: "CastPluginTests",
            dependencies: ["CastPlugin"],
            path: "ios/Tests/CastPluginTests")
    ]
)
