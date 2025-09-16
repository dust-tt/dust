import SwiftUI

struct ContentView: View {
  @StateObject private var audioRecorder = AudioRecorder()
  @StateObject private var viewModel = TranscriptViewModel()
  @State private var hasPermission = false
  @State private var showingLoginDialog = false
  @State private var deviceSelectionWindow: NSWindow?

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
            VStack(spacing: 4) {
              Text("Folder: \(folder.name)")
                .font(.caption2)
                .foregroundColor(.secondary)
              Button(action: openSetupWindow) {
                HStack {
                  Image(systemName: "arrow.triangle.2.circlepath")
                  Text("Change Folder")
                }
              }
              .font(.caption2)
            }
          }
        } else {
          Button(action: openSetupWindow) {
            HStack {
              Image(systemName: "folder.badge.gearshape")
              Text("Setup Folder")
            }
          }
          .font(.caption)
        }

        Button(action: { viewModel.logout() }) {
          Text("Logout")
        }
        .font(.caption)
      } else {
        Button(action: {
          print("Login button clicked")
          openLoginWindow()
        }) {
          HStack {
            Image(systemName: "person.circle")
            Text("Login")
          }
        }
      }

      Divider()

      Button(action: openAudioDeviceSelection) {
        HStack {
          Image(systemName: "microphone.fill")
          Text("Select input")
        }
      }
      .font(.caption2)

      Button(action: {
        NSApplication.shared.terminate(nil)
      }) {
        Text("Quit")
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
        await audioRecorder.startRecording()
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

  private func openAudioDeviceSelection() {
    deviceSelectionWindow?.close()

    let setupWindow = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 450, height: 350),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    setupWindow.title = "Select Audio Input Device"

    setupWindow.contentView = NSHostingView(
      rootView: AudioDeviceSelectionView(
        onDeviceSelected: { device in
          if AudioDeviceManager.shared.setDefaultInputDevice(device) {
            print("Successfully selected audio device: \(device.name)")
          } else {
            print("Failed to set audio device: \(device.name)")
          }
        },
        onClose: {
          setupWindow.close()
        }
      )
    )

    setupWindow.center()
    setupWindow.makeKeyAndOrderFront(nil)
    setupWindow.orderFrontRegardless()
    deviceSelectionWindow = setupWindow
  }

}

#Preview {
  ContentView()
}
