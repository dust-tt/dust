import SparkleTokens
import SwiftUI

struct PillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .sparkleLabelXs()
            .foregroundStyle(Color.dustForeground)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.dustBackground, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.dustBorder, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle {
        PillButtonStyle()
    }
}
