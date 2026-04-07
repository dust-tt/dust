import SwiftUI

// Reusable liquid glass effect modifiers for iOS 26+
// Falls back to a subtle translucent background on older versions.

struct LiquidGlassModifier<S: InsettableShape>: ViewModifier {
    let shape: S

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: shape)
        } else {
            content
                .background(.ultraThinMaterial, in: shape)
        }
    }
}

extension View {
    func liquidGlass(in shape: some InsettableShape) -> some View {
        modifier(LiquidGlassModifier(shape: shape))
    }

    func liquidGlassCapsule() -> some View {
        liquidGlass(in: .capsule)
    }

    func liquidGlassCircle() -> some View {
        liquidGlass(in: .circle)
    }

    func liquidGlassRoundedRect(cornerRadius: CGFloat = 16) -> some View {
        liquidGlass(in: RoundedRectangle(cornerRadius: cornerRadius))
    }
}
