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
  @State private var showLoginSuccessMessage = false

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
      .disabled(audioRecorder.isRecording || !isLoggedIn || !isSetupComplete)

      Button(action: stopRecording) {
        HStack {
          Image(systemName: "stop.circle")
          Text("Stop Recording")
        }
      }
      .disabled(!audioRecorder.isRecording)

      Divider()

      if isLoggedIn {
        if showLoginSuccessMessage {
          Label("Login successful!", systemImage: "checkmark.circle.fill")
            .font(.caption)
            .foregroundColor(.green)
            .labelStyle(.titleAndIcon)
        } else {
          Label("Logged in", systemImage: "checkmark.circle.fill")
            .font(.caption)
            .foregroundColor(.green)
            .labelStyle(.titleAndIcon)
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
    .frame(minWidth: 350)
    .onAppear {
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
    Task {
      if !hasPermission {
        hasPermission = await audioRecorder.requestPermission()
      }

      if hasPermission {
        await MainActor.run {
          audioRecorder.startRecording()
        }
      }
    }
  }

  private func stopRecording() {
    audioRecorder.stopRecording()

    // Wait a moment for the recording data to be processed
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
      if let recordingData = audioRecorder.recordingData,
         let recordingId = audioRecorder.recordingId {
        print("Recording completed: \(recordingData.count) bytes")

        // Upload to Dust API using stored credentials
        if let apiKey = UserDefaultsManager.shared.loadAPIKey(),
          let workspaceId = UserDefaultsManager.shared.loadWorkspaceId(),
          let selectedFolder = UserDefaultsManager.shared.loadSelectedFolder()
        {
          uploadTranscript(
            audioData: recordingData,
            documentId: recordingId,
            apiKey: apiKey,
            workspaceId: workspaceId,
            spaceId: selectedFolder.spaceId,
            dataSourceId: selectedFolder.dataSourceId
          )
        } else {
          print("Missing credentials or folder selection for upload")
        }
      } else {
        print("No recording data available")
      }
    }
  }

  private func uploadTranscript(
    audioData: Data,
    documentId: String,
    apiKey: String,
    workspaceId: String,
    spaceId: String,
    dataSourceId: String
  ) {
    Task {
      do {

        print("Uploading transcript to Dust...")
        let response = try await DustAPIClient.shared.uploadTranscript(
          apiKey: apiKey,
          workspaceId: workspaceId,
          spaceId: spaceId,
          dataSourceId: dataSourceId,
          documentId: documentId,
          audioData: audioData
        )

        await MainActor.run {
          print("Transcript uploaded successfully!")
          print("Document ID: \(response.document.documentId)")
        }
      } catch {
        await MainActor.run {
          print("Failed to upload transcript: \(error.localizedDescription)")
          if let dustError = error as? DustAPIError {
            print("Dust API Error: \(dustError.message)")
          }
        }
      }
    }
  }

  private func checkLoginStatus() {
    isLoggedIn = UserDefaultsManager.shared.hasCompleteCredentials()
  }

  private func checkSetupStatus() {
    isSetupComplete = UserDefaultsManager.shared.hasCompleteSetup()
  }

  private func login(completion: @escaping (Bool) -> Void = { _ in }) {
    guard !apiKeyInput.isEmpty, !workspaceIdInput.isEmpty else {
      completion(false)
      return
    }

    // Validate API key format
    guard apiKeyInput.hasPrefix("sk-") else {
      loginErrorMessage = "Invalid API key format"
      showingLoginError = true
      completion(false)
      return
    }

    // Validate credentials by calling the API
    Task {
      do {
        _ = try await DustAPIClient.shared.fetchSpaces(
          apiKey: apiKeyInput,
          workspaceId: workspaceIdInput
        )

        // If we get here, credentials are valid - save them
        await MainActor.run {
          if UserDefaultsManager.shared.saveAPIKey(apiKeyInput)
            && UserDefaultsManager.shared.saveCredentials(
              apiKey: apiKeyInput,
              workspaceId: workspaceIdInput,
              folderId: ""
            )
          {
            isLoggedIn = true
            apiKeyInput = ""
            workspaceIdInput = ""
            checkSetupStatus()
            showLoginSuccessMessage = true
            print("Credentials validated and saved successfully")
            completion(true)

            // Hide success message after 3 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
              showLoginSuccessMessage = false
            }
          } else {
            loginErrorMessage = "Failed to save credentials"
            showingLoginError = true
            completion(false)
          }
        }
      } catch {
        await MainActor.run {
          if let dustError = error as? DustAPIError {
            loginErrorMessage = dustError.message
          } else {
            loginErrorMessage = "Login failed"
          }
          showingLoginError = true
          completion(false)
        }
      }
    }
  }

  private func logout() {
    if UserDefaultsManager.shared.deleteCredentials()
      && UserDefaultsManager.shared.deleteSelectedFolder()
    {
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
          login { success in
            if success {
              loginWindow.close()
            }
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
      let workspaceId = UserDefaultsManager.shared.loadWorkspaceId()
    else {
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
