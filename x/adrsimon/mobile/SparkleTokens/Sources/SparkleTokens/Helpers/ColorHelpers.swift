import SwiftUI
import UIKit

extension Color {
    /// Creates a Color that adapts to light/dark mode using hex strings.
    init(light: String, dark: String) {
        self.init(UIColor { traitCollection in
            traitCollection.userInterfaceStyle == .dark
                ? UIColor(hex: dark)
                : UIColor(hex: light)
        })
    }
}

extension UIColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&rgb)

        let rgba = hex.count == 8 ? rgb : rgb << 8 | 0xFF

        let red = CGFloat((rgba >> 24) & 0xFF) / 255.0
        let green = CGFloat((rgba >> 16) & 0xFF) / 255.0
        let blue = CGFloat((rgba >> 8) & 0xFF) / 255.0
        let alpha = CGFloat(rgba & 0xFF) / 255.0

        self.init(red: red, green: green, blue: blue, alpha: alpha)
    }
}
