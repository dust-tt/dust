import SparkleTokens
import SwiftUI

struct LoadingView: View {
    @State private var isPulsing = false

    var body: some View {
        DustLogo.dustLogo.image
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(height: 28)
            .scaleEffect(isPulsing ? 1.06 : 0.96)
            .opacity(isPulsing ? 1 : 0.7)
            .animation(
                .easeInOut(duration: 1.2).repeatForever(autoreverses: true),
                value: isPulsing
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.dustBackground)
            .onAppear {
                isPulsing = true
            }
    }
}
