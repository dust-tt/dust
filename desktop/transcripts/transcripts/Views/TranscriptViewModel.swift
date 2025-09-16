import SwiftUI

@MainActor
class TranscriptViewModel: ObservableObject {
  @Published var isLoggedIn = false
  @Published var isSetupComplete = false
  @Published var showLoginSuccessMessage = false
  @Published var showingLoginError = false
  @Published var loginErrorMessage = ""

  @Published var apiKeyInput = "" {
    didSet {
      print("ViewModel apiKeyInput changed to: '\(apiKeyInput)'")
    }
  }
  @Published var workspaceIdInput = "" {
    didSet {
      print("ViewModel workspaceIdInput changed to: '\(workspaceIdInput)'")
    }
  }

  var isLoginButtonEnabled: Bool {
    !apiKeyInput.isEmpty && !workspaceIdInput.isEmpty
  }

  func checkLoginStatus() {
    isLoggedIn = UserDefaultsManager.shared.hasCompleteCredentials()
  }

  func checkSetupStatus() {
    isSetupComplete = UserDefaultsManager.shared.hasCompleteSetup()
  }

  func login(completion: @escaping (Bool) -> Void = { _ in }) {
    guard !apiKeyInput.isEmpty, !workspaceIdInput.isEmpty else {
      completion(false)
      return
    }

    guard apiKeyInput.hasPrefix("sk-") else {
      loginErrorMessage = "Invalid API key format"
      showingLoginError = true
      completion(false)
      return
    }

    // Validate credentials by calling the API (using the /spaces endpoint).
    Task {
      do {
        _ = try await DustAPIClient.shared.fetchSpaces(
          apiKey: apiKeyInput,
          workspaceId: workspaceIdInput
        )

        // If we get here, credentials are valid, we save them.
        if UserDefaultsManager.shared.saveCredentials(
          apiKey: apiKeyInput,
          workspaceId: workspaceIdInput,
          folderId: ""
        ) {
          isLoggedIn = true
          apiKeyInput = ""
          workspaceIdInput = ""
          checkSetupStatus()
          showLoginSuccessMessage = true
          print("Credentials validated and saved successfully")
          completion(true)

          // Hide success message after some delay.
          DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.showLoginSuccessMessage = false
          }
        } else {
          loginErrorMessage = "Failed to save credentials"
          showingLoginError = true
          completion(false)
        }
      } catch {
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

  func logout() {
    if UserDefaultsManager.shared.deleteCredentials() {
      isLoggedIn = false
      isSetupComplete = false
      print("Logged out successfully")
    } else {
      print("Failed to logout")
    }
  }

  func loadStoredCredentials() -> TranscriptUploadCredentials? {
    guard let selectedFolder = UserDefaultsManager.shared.loadSelectedFolder()
    else {
      return nil
    }

    return TranscriptUploadCredentials(
      from: UserDefaultsManager.self,
      selectedFolder: selectedFolder
    )
  }

  func handleRecordingCompletion(recordingData: Data, recordingId: String) {
    print("Recording completed: \(recordingData.count) bytes")

    guard let credentials = loadStoredCredentials() else {
      print("Missing credentials or folder selection for upload")
      return
    }

    uploadTranscript(
      audioData: recordingData,
      documentId: recordingId,
      credentials: credentials
    )
  }

  private func uploadTranscript(
    audioData: Data,
    documentId: String,
    credentials: TranscriptUploadCredentials
  ) {
    Task {
      do {
        print("Uploading transcript to Dust...")
        let response = try await DustAPIClient.shared.uploadTranscript(
          apiKey: credentials.apiKey,
          workspaceId: credentials.workspaceId,
          spaceId: credentials.spaceId,
          dataSourceId: credentials.dataSourceId,
          documentId: documentId,
          audioData: audioData
        )

        print("Transcript uploaded successfully!")
        print("Document ID: \(response.document.documentId)")
      } catch {
        print("Failed to upload transcript: \(error.localizedDescription)")
        if let dustError = error as? DustAPIError {
          print("Dust API Error: \(dustError.message)")
        }
      }
    }
  }
}
