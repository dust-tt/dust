import SwiftUI

struct WorkspacePickerView: View {
    @EnvironmentObject var authService: AuthService

    var body: some View {
        VStack(spacing: 24) {
            Text("Select a Workspace")
                .font(.title2.bold())
                .padding(.top, 32)

            if let workspaces = authService.currentUser?.workspaces {
                List(workspaces) { workspace in
                    Button {
                        Task {
                            await authService.selectWorkspace(workspace.sId)
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(workspace.name)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(workspace.role.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            if authService.currentUser?.selectedWorkspace == workspace.sId {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.blue)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            } else {
                ContentUnavailableView(
                    "No Workspaces",
                    systemImage: "building.2",
                    description: Text("No workspaces available. Please contact your administrator.")
                )
            }
        }
        .navigationTitle("Workspace")
    }
}
