import SparkleTokens
import SwiftUI

struct LoginView: View {
    let onLogin: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 12) {
                DustLogo.dustLogo.image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 36)

                Text("The Operating System for AI Agents")
                    .sparkleCopy2xl()
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.dustForeground)
            }
            .padding(.horizontal, 40)

            VStack(spacing: 12) {
                Button(action: onLogin) {
                    Text("Log In")
                        .sparkleLabelBase()
                        .foregroundStyle(Color.dustBackground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .background(Color.dustForeground)
                .clipShape(RoundedRectangle(cornerRadius: 48))

                Link(destination: URL(string: AppConfig.apiBaseURL)!) {
                    Text("Sign Up")
                        .sparkleLabelBase()
                        .foregroundStyle(Color.dustForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .background(Color.dustBackground)
                .clipShape(RoundedRectangle(cornerRadius: 48))
                .overlay(
                    RoundedRectangle(cornerRadius: 48)
                        .stroke(Color.dustForeground.opacity(0.2), lineWidth: 1)
                )
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 48)

            Spacer()
        }
        .background(Color.dustBackground)
    }
}
