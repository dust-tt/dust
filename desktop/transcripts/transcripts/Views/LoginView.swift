import SwiftUI

struct LoginView: View {
  @Binding var apiKeyInput: String
  @Binding var workspaceIdInput: String
  @Binding var showingError: Bool
  @Binding var errorMessage: String
  @ObservedObject var viewModel: TranscriptViewModel
  let onLogin: () -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(spacing: 15) {
      Text("Login to Dust")
        .font(.headline)

      Text(
        "Please enter your Dust credentials to enable transcription features."
      )
      .font(.caption)
      .multilineTextAlignment(.center)

      VStack(spacing: 10) {
        SecureField("API Key (starts with sk-)", text: $apiKeyInput)
          .textFieldStyle(RoundedBorderTextFieldStyle())
          .onChange(of: apiKeyInput) { newValue in
            let cleanedValue = newValue.replacingOccurrences(of: "\n", with: "")
              .replacingOccurrences(of: "\r", with: "")
              .trimmingCharacters(in: .whitespacesAndNewlines)
            if cleanedValue != newValue {
              apiKeyInput = cleanedValue
            }
          }

        TextField("Workspace ID", text: $workspaceIdInput)
          .textFieldStyle(RoundedBorderTextFieldStyle())
      }
      .frame(width: 300)

      HStack(spacing: 20) {
        Button("Cancel") {
          onCancel()
        }
        .keyboardShortcut(.cancelAction)

        Button("Login") {
          onLogin()
        }
        .keyboardShortcut(.defaultAction)
        .disabled(!viewModel.isLoginButtonEnabled)
      }
    }
    .frame(width: 400, height: 220)
    .alert("Login Error", isPresented: $showingError) {
      Button("OK") {}
    } message: {
      Text(errorMessage)
    }
  }
}

#Preview {
  LoginView(
    apiKeyInput: .constant(""),
    workspaceIdInput: .constant(""),
    showingError: .constant(false),
    errorMessage: .constant(""),
    viewModel: TranscriptViewModel(),
    onLogin: {},
    onCancel: {}
  )
}
