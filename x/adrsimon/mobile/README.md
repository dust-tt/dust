# Dust iOS App

A native Swift/SwiftUI iOS app for Dust with WorkOS authentication.

## Requirements

- Xcode 16+
- iOS 17.4+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

## Getting Started

```bash
cd x/adrsimon/mobile
xcodegen generate
open Dust.xcodeproj
```

Or run from the command line:

```bash
xcodebuild -project Dust.xcodeproj -scheme Dust \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build

xcrun simctl boot "iPhone 17 Pro"
xcrun simctl install "iPhone 17 Pro" \
  ~/Library/Developer/Xcode/DerivedData/Dust-*/Build/Products/Debug-iphonesimulator/Dust.app
xcrun simctl launch "iPhone 17 Pro" com.dust.mobile
```

## Architecture

```
Dust/
├── App/
│   └── DustMobileApp.swift        # @main entry point, deep link handling
├── Config/
│   └── AppConfig.swift            # API base URL, endpoints, URL scheme
├── Models/
│   └── User.swift                 # User, AuthResponse, AuthTokens
├── Services/
│   ├── APIClient.swift            # Generic async/await HTTP client
│   ├── AuthService.swift          # PKCE generation, token exchange/refresh
│   └── KeychainService.swift      # Secure token storage (Security framework)
├── ViewModels/
│   └── AuthViewModel.swift        # Auth state machine, drives UI
├── Views/
│   ├── ContentView.swift          # Root view, switches on AuthState
│   ├── LoginView.swift            # Login button
│   └── ProfileView.swift          # User info display
└── Resources/
    └── Assets.xcassets/           # Colors, app icon
```
