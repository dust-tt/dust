import SwiftUI

struct LoginView: View {
    @Binding var apiKeyInput: String
    let onLogin: () -> Void
    let onCancel: () -> Void
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Enter Dust API Key")
                .font(.headline)
            
            Text("Please enter your Dust API key to enable transcription features.")
                .font(.caption)
                .multilineTextAlignment(.center)
            
            SecureField("API Key", text: $apiKeyInput)
                .textFieldStyle(RoundedBorderTextFieldStyle())
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
                .disabled(apiKeyInput.isEmpty)
            }
        }
        .frame(width: 400, height: 200)
    }
}

#Preview {
    LoginView(apiKeyInput: .constant(""), onLogin: {}, onCancel: {})
}
