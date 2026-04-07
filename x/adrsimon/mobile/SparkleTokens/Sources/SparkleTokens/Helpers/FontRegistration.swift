import CoreGraphics
import CoreText
import Foundation

public enum SparkleFonts {
    /// Registers Geist font files bundled in the SparkleTokens package.
    /// Call this once at app launch (e.g., in your App's init()).
    public static func registerFonts() {
        let fontNames = [
            "Geist-Regular",
            "Geist-Medium",
            "Geist-SemiBold",
            "GeistMono-Regular",
        ]

        for fontName in fontNames {
            guard let url = Bundle.module.url(forResource: fontName, withExtension: "otf"),
                  let data = try? Data(contentsOf: url) as CFData,
                  let provider = CGDataProvider(data: data),
                  let font = CGFont(provider)
            else {
                continue
            }
            CTFontManagerRegisterGraphicsFont(font, nil)
        }
    }
}
