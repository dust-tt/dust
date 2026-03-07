import SparkleTokens
import SwiftUI

struct LoginView: View {
    let onLogin: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 12) {
                DustLogo.dustLogoSquare.image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 64, height: 64)

                Text("Dust")
                    .sparkleHeading2xl()
                    .foregroundStyle(Color.dustForeground)

                Text("Build and operate agents for work")
                    .sparkleCopyBase()
                    .foregroundStyle(Color.dustFaint)
            }

            Spacer()

            Button(action: onLogin) {
                Text("Log In")
                    .sparkleLabelBase()
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .background(Color.highlight)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 40)
            .padding(.bottom, 48)
        }
        .background(Color.dustBackground)
    }
}
