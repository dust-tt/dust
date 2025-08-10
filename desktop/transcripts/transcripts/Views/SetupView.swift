import SwiftUI

struct SetupView: View {
  @State private var availableFolders: [DustFolder] = []
  @State private var selectedFolder: DustFolder?
  @State private var isLoading = true
  @State private var errorMessage: String?
  @State private var showingError = false

  let apiKey: String
  let workspaceId: String
  let onFolderSelected: (DustFolder) -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(spacing: 20) {
      Text("Setup Dust Integration")
        .font(.headline)

      Text("Select a folder where your recordings will be uploaded.")
        .font(.caption)
        .multilineTextAlignment(.center)

      if isLoading {
        VStack(spacing: 10) {
          ProgressView()
            .scaleEffect(0.8)
          Text("Loading available folders...")
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .frame(height: 80)
      } else if availableFolders.isEmpty {
        VStack(spacing: 10) {
          Image(systemName: "folder.badge.questionmark")
            .font(.title2)
            .foregroundColor(.secondary)
          Text("No folders available")
            .font(.caption)
            .foregroundColor(.secondary)

          Button(action: {
            Task {
              await loadFolders()
            }
          }) {
            HStack(spacing: 4) {
              Image(systemName: "arrow.clockwise")
                .font(.caption)
              Text("Retry")
                .font(.caption)
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 4)
          }
          .buttonStyle(.bordered)
          .controlSize(.small)
        }
        .frame(height: 110)
      } else {
        VStack(alignment: .leading, spacing: 8) {
          Text("Select Folder:")
            .font(.caption)
            .foregroundColor(.secondary)

          Picker("Folder", selection: $selectedFolder) {
            Text("Choose a folder...").tag(nil as DustFolder?)
            ForEach(availableFolders) { folder in
              Text(folder.displayName).tag(folder as DustFolder?)
            }
          }
          .pickerStyle(MenuPickerStyle())
          .frame(width: 350)
        }
      }

      HStack(spacing: 20) {
        Button("Cancel") {
          onCancel()
        }
        .keyboardShortcut(.cancelAction)

        Button("Save") {
          if let folder = selectedFolder {
            onFolderSelected(folder)
          }
        }
        .keyboardShortcut(.defaultAction)
        .disabled(selectedFolder == nil)
      }
    }
    .padding(30)
    .frame(width: 450, height: 280)
    .task {
      await loadFolders()
    }
    .alert("Setup Error", isPresented: $showingError) {
      Button("OK") {}
    } message: {
      Text(errorMessage ?? "Unknown error occurred")
    }
  }

  private func loadFolders() async {
    isLoading = true
    errorMessage = nil

    do {
      let folders = try await DustAPIClient.shared.fetchAvailableFolders(
        apiKey: apiKey,
        workspaceId: workspaceId
      )

      await MainActor.run {
        self.availableFolders = folders
        self.isLoading = false
      }
    } catch let error as DustAPIError {
      await MainActor.run {
        self.errorMessage = error.localizedDescription
        self.showingError = true
        self.isLoading = false
      }
    } catch {
      await MainActor.run {
        self.errorMessage =
          "Failed to load folders: \(error.localizedDescription)"
        self.showingError = true
        self.isLoading = false
      }
    }
  }
}

#Preview {
  SetupView(
    apiKey: "sk-test",
    workspaceId: "test-workspace",
    onFolderSelected: { _ in },
    onCancel: {}
  )
}
