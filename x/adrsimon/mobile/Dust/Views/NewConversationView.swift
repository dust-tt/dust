import SparkleTokens
import SwiftUI

struct NewConversationView: View {
    let firstName: String?

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            DustLogo.dustLogoSquare.image
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 48, height: 48)

            Text("Hey \(firstName ?? "there"), how can I help you today?")
                .sparkleCopyXl()
                .foregroundStyle(Color.dustForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.dustBackground)
    }
}
