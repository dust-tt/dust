import SwiftUI

struct ContentView: View {
  @StateObject private var audioRecorder = AudioRecorder()
  @State private var hasPermission = false
  @State private var isLoggedIn = false
  @State private var showingLoginDialog = false
  @State private var apiKeyInput = ""
  @State private var workspaceIdInput = ""
  @State private var isSetupComplete = false
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
            .fixedSize()
        }

        if isSetupComplete {
          if let folder = UserDefaultsManager.shared.loadSelectedFolder() {
            Text("Folder: \(folder.name)")
              .font(.caption2)
              .foregroundColor(.secondary)
          }
        } else {
          Button("Setup Folder") {
            openSetupWindow()
          }
          .font(.caption)
        }

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
    .frame(minWidth: 250)
    .onAppear {
      requestMicrophonePermission()
      checkLoginStatus()
      checkSetupStatus()
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
      // TODO: Upload to Dust API using stored credentials
      if let apiKey = UserDefaultsManager.shared.loadAPIKey(),
         let workspaceId = UserDefaultsManager.shared.loadWorkspaceId(),
         let selectedFolder = UserDefaultsManager.shared.loadSelectedFolder() {
        print("Credentials available for upload:")
        print("  API Key: \(apiKey.prefix(10))...")
        print("  Workspace ID: \(workspaceId)")
        print("  Selected Folder: \(selectedFolder.displayName)")
        print("  Space ID: \(selectedFolder.spaceId)")
        print("  Data Source View ID: \(selectedFolder.dataSourceViewId)")
      }
    }
  }

  private func checkLoginStatus() {
    isLoggedIn = UserDefaultsManager.shared.hasCompleteCredentials()
  }
  
  private func checkSetupStatus() {
    isSetupComplete = UserDefaultsManager.shared.hasCompleteSetup()
  }

  private func login() {
    guard !apiKeyInput.isEmpty, !workspaceIdInput.isEmpty else { return }

    // Validate API key format
    guard apiKeyInput.hasPrefix("sk-") else {
      loginErrorMessage = "Invalid API key format. API keys must start with 'sk-'"
      showingLoginError = true
      return
    }

    // Save only API key and workspace ID for now
    if UserDefaultsManager.shared.saveAPIKey(apiKeyInput) && 
       UserDefaultsManager.shared.saveCredentials(apiKey: apiKeyInput, workspaceId: workspaceIdInput, folderId: "") {
      isLoggedIn = true
      apiKeyInput = ""
      workspaceIdInput = ""
      showingLoginDialog = false
      checkSetupStatus() // Check if setup is still complete
      print("Credentials saved successfully")
    } else {
      loginErrorMessage = "Failed to save credentials. Please try again."
      showingLoginError = true
    }
  }

  private func logout() {
    if UserDefaultsManager.shared.deleteCredentials() && 
       UserDefaultsManager.shared.deleteSelectedFolder() {
      isLoggedIn = false
      isSetupComplete = false
      print("Logged out successfully")
    } else {
      print("Failed to logout")
    }
  }

  private func openLoginWindow() {
    let loginWindow = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 400, height: 220),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    loginWindow.title = "Login to Dust"
    loginWindow.contentView = NSHostingView(
      rootView: LoginView(
        apiKeyInput: $apiKeyInput,
        workspaceIdInput: $workspaceIdInput,
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
          workspaceIdInput = ""
          loginWindow.close()
        }
      )
    )
    loginWindow.center()
    loginWindow.makeKeyAndOrderFront(nil)
    loginWindow.orderFrontRegardless()
  }
  
  private func openSetupWindow() {
    guard let apiKey = UserDefaultsManager.shared.loadAPIKey(),
          let workspaceId = UserDefaultsManager.shared.loadWorkspaceId() else {
      print("Missing credentials for setup")
      return
    }
    
    let setupWindow = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 450, height: 280),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    setupWindow.title = "Setup Dust Integration"
    setupWindow.contentView = NSHostingView(
      rootView: SetupView(
        apiKey: apiKey,
        workspaceId: workspaceId,
        onFolderSelected: { folder in
          if UserDefaultsManager.shared.saveSelectedFolder(folder) {
            isSetupComplete = true
            print("Selected folder: \(folder.displayName)")
          }
          setupWindow.close()
        },
        onCancel: {
          setupWindow.close()
        }
      )
    )
    setupWindow.center()
    setupWindow.makeKeyAndOrderFront(nil)
    setupWindow.orderFrontRegardless()
  }
}

#Preview {
  ContentView()
}
