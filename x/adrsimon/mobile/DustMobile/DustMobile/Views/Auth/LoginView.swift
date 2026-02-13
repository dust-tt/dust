import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Logo area
            VStack(spacing: 16) {
                Image(systemName: "sparkles")
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)

                Text("Dust")
                    .font(.largeTitle.bold())

                Text("AI-powered assistant for your workspace")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()

            // Login button
            VStack(spacing: 16) {
                Button {
                    Task {
                        await authService.login()
                    }
                } label: {
                    if authService.isLoading {
                        ProgressView()
                            .tint(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                    } else {
                        Text("Sign In")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(authService.isLoading)
                .padding(.horizontal, 24)

                if let error = authService.authError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            }

            Spacer()
                .frame(height: 40)
        }
    }
}
