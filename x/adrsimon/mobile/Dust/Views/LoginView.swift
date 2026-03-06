import SwiftUI

struct LoginView: View {
    let onLogin: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)

                Text("Dust")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Build and operate agents for work")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button(action: onLogin) {
                Text("Log In")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 40)
            .padding(.bottom, 48)
        }
    }
}
