// DO NOT EDIT — Generated from Sparkle (tailwind.config.js)
// Run: cd sparkle && node scripts/generate-swift.mjs


import SwiftUI

/// Type-safe access to Dust logo variants bundled in SparkleTokens.
public enum DustLogo: String, CaseIterable {
    case dustLogo = "DustLogo"
    case dustLogoMono = "DustLogoMono"
    case dustLogoMonoWhite = "DustLogoMonoWhite"
    case dustLogoWhite = "DustLogoWhite"
    case dustLogoGray = "DustLogoGray"
    case dustLogoSquare = "DustLogoSquare"
    case dustLogoSquareMono = "DustLogoSquareMono"
    case dustLogoSquareMonoWhite = "DustLogoSquareMonoWhite"
    case dustLogoSquareWhite = "DustLogoSquareWhite"
    case dustLogoSquareGray = "DustLogoSquareGray"

    public var image: Image {
        Image(rawValue, bundle: .module)
    }
}
