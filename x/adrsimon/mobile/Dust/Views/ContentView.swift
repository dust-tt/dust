import SparkleTokens
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        switch authViewModel.state {
        case .loading:
            ProgressView("Loading...")

        case .unauthenticated:
            LoginView(onLogin: { authViewModel.login() })

        case .authenticating:
            ProgressView("Signing in...")

        case let .authenticated(user, tokenProvider):
            MainContainerView(
                user: user,
                tokenProvider: tokenProvider,
                onLogout: { authViewModel.logout() }
            )

        case let .error(message):
            ErrorView(message: message, onRetry: { authViewModel.logout() })
        }
    }
}

private struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(Color.warning)

            Text("Something went wrong")
                .sparkleHeadingXl()
                .foregroundStyle(Color.dustForeground)

            Text(message)
                .sparkleCopyBase()
                .foregroundStyle(Color.dustFaint)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button("Try Again", action: onRetry)
                .buttonStyle(.borderedProminent)
                .tint(Color.highlight)
        }
        .background(Color.dustBackground)
    }
}
