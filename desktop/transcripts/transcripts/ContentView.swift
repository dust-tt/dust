import SwiftUI

struct ContentView: View {
  @StateObject private var audioRecorder = AudioRecorder()
  @State private var hasPermission = false
  @State private var isLoggedIn = false
  @State private var showingLoginDialog = false
  @State private var apiKeyInput = ""
  @State private var showingLoginError = false
  @State private var loginErrorMessage = ""

  var body: some View {
    VStack(spacing: 8) {
      Image("DustLogo")
        .resizable()
        .aspectRatio(contentMode: .fit)
        .frame(height: 32)

      Button(action: startRecording) {
        HStack {
          Image(systemName: "record.circle")
          Text("Start Recording")
        }
      }
      .disabled(audioRecorder.isRecording || !hasPermission)

      Button(action: stopRecording) {
        HStack {
          Image(systemName: "stop.circle")
          Text("Stop Recording")
        }
      }
      .disabled(!audioRecorder.isRecording)

      Divider()

      if isLoggedIn {
        HStack(spacing: 4) {
          Image(systemName: "checkmark.circle.fill")
            .foregroundColor(.green)
            .font(.caption)
          Text("Logged in")
            .font(.caption)
        }
        .fixedSize()

        Button("Logout") {
          logout()
        }
        .font(.caption)
      } else {
        Button("Login") {
          print("Login button clicked")
          openLoginWindow()
        }
      }

      Divider()

      Button("Quit") {
        NSApplication.shared.terminate(nil)
      }
    }
    .padding()
    .onAppear {
      requestMicrophonePermission()
      checkLoginStatus()
    }
  }

  private func requestMicrophonePermission() {
    Task {
      hasPermission = await audioRecorder.requestPermission()
    }
  }

  private func startRecording() {
    audioRecorder.startRecording()
  }

  private func stopRecording() {
    audioRecorder.stopRecording()

    if let url = audioRecorder.recordingURL {
      print("Recording saved to: \(url)")
      // TODO: Upload to Dust API using stored API key
      if let apiKey = UserDefaultsManager.shared.loadAPIKey() {
        print("API Key available for upload: \(apiKey.prefix(10))...")
      }
    }
  }

  private func checkLoginStatus() {
    isLoggedIn = UserDefaultsManager.shared.hasAPIKey()
  }

  private func login() {
    guard !apiKeyInput.isEmpty else { return }
    
    // Validate API key format
    guard apiKeyInput.hasPrefix("sk-") else {
      loginErrorMessage = "Invalid API key format."
      showingLoginError = true
      return
    }

    if UserDefaultsManager.shared.saveAPIKey(apiKeyInput) {
      isLoggedIn = true
      apiKeyInput = ""
      showingLoginDialog = false
      print("API key saved successfully")
    } else {
      loginErrorMessage = "Failed to save API key. Please try again."
      showingLoginError = true
    }
  }

  private func logout() {
    if UserDefaultsManager.shared.deleteAPIKey() {
      isLoggedIn = false
      print("Logged out successfully")
    } else {
      print("Failed to logout")
    }
  }

  private func openLoginWindow() {
    let loginWindow = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    loginWindow.title = "Login to Dust"
    loginWindow.contentView = NSHostingView(
      rootView: LoginView(
        apiKeyInput: $apiKeyInput,
        showingError: $showingLoginError,
        errorMessage: $loginErrorMessage,
        onLogin: {
          login()
          if !showingLoginError {
            loginWindow.close()
          }
        },
        onCancel: {
          apiKeyInput = ""
          loginWindow.close()
        }
      )
    )
    loginWindow.center()
    loginWindow.makeKeyAndOrderFront(nil)
    loginWindow.orderFrontRegardless()
  }
}

#Preview {
  ContentView()
}
