import SwiftUI

struct ContentView: View {
  @StateObject private var audioRecorder = AudioRecorder()
  @StateObject private var viewModel = TranscriptViewModel()
  @State private var hasPermission = false
  @State private var showingLoginDialog = false

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
      .disabled(
        audioRecorder.isRecording || !viewModel.isLoggedIn
          || !viewModel.isSetupComplete
      )

      Button(action: stopRecording) {
        HStack {
          Image(systemName: "stop.circle")
          Text("Stop Recording")
        }
      }
      .disabled(!audioRecorder.isRecording)

      Divider()

      if viewModel.isLoggedIn {
        if viewModel.showLoginSuccessMessage {
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

        if viewModel.isSetupComplete {
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
          viewModel.logout()
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
      viewModel.checkLoginStatus()
      viewModel.checkSetupStatus()
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
    DispatchQueue.main.asyncAfter(
      deadline: .now() + AudioSettings.recordingDataProcessingDelay
    ) {
      guard let recordingData = audioRecorder.recordingData,
        let recordingId = audioRecorder.recordingId
      else {
        print("No recording data available")
        return
      }

      viewModel.handleRecordingCompletion(
        recordingData: recordingData,
        recordingId: recordingId
      )
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
        apiKeyInput: $viewModel.apiKeyInput,
        workspaceIdInput: $viewModel.workspaceIdInput,
        showingError: $viewModel.showingLoginError,
        errorMessage: $viewModel.loginErrorMessage,
        viewModel: viewModel,
        onLogin: {
          viewModel.login { success in
            if success {
              loginWindow.close()
            }
          }
        },
        onCancel: {
          viewModel.apiKeyInput = ""
          viewModel.workspaceIdInput = ""
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
            viewModel.isSetupComplete = true
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
