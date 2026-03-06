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

        case let .authenticated(user):
            ProfileView(user: user, onLogout: { authViewModel.logout() })

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
                .foregroundStyle(.red)

            Text("Something went wrong")
                .font(.title2)
                .fontWeight(.semibold)

            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button("Try Again", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
    }
}
