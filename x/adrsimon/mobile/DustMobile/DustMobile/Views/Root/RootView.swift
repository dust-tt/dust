import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authService: AuthService

    var body: some View {
        Group {
            if authService.isAuthenticated {
                if authService.currentUser?.selectedWorkspace != nil {
                    MainTabView()
                } else {
                    WorkspacePickerView()
                }
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut, value: authService.isAuthenticated)
    }
}

struct MainTabView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView {
            NavigationStack {
                HomeView()
            }
            .tabItem {
                Label("Home", systemImage: "house")
            }

            NavigationStack {
                ConversationListView()
            }
            .tabItem {
                Label("Conversations", systemImage: "bubble.left.and.bubble.right")
            }

            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
        }
    }
}

// MARK: - Home View

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @State private var agentPickerVM: AgentPickerViewModel?
    @State private var inputVM: InputBarViewModel?
    @State private var activeConversationId: String?
    @State private var isSending = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Greeting
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Hi \(appState.authService.currentUser?.firstName ?? "")!")
                            .font(.title.bold())
                        Text("How can I help you today?")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)

                    // Favorite agent chips
                    if let agentPickerVM, !agentPickerVM.favoriteAgents.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(agentPickerVM.favoriteAgents) { agent in
                                    AgentChipView(agent: agent) {
                                        inputVM?.addMention(agent: agent)
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                }
                .padding(.vertical)
            }

            Divider()

            if let inputVM {
                InputBarView(viewModel: inputVM, agentPickerVM: agentPickerVM) {
                    await sendFirstMessage()
                }
            }
        }
        .navigationTitle("Dust")
        .navigationDestination(item: $activeConversationId) { id in
            ConversationDetailView(appState: appState, conversationId: id)
        }
        .refreshable {
            await agentPickerVM?.refresh()
        }
        .task {
            if agentPickerVM == nil {
                agentPickerVM = AgentPickerViewModel(appState: appState)
            }
            if inputVM == nil {
                inputVM = InputBarViewModel(appState: appState)
            }
            await agentPickerVM?.loadAgents()
        }
    }

    private func sendFirstMessage() async {
        guard let inputVM,
              let workspaceId = appState.workspaceId,
              let user = appState.authService.currentUser else { return }

        isSending = true

        let content = inputVM.buildMessageContent()
        let mentions = inputVM.mentions
        let fragments = inputVM.attachments

        let messageBody = PostMessageBody(
            content: content,
            context: PostMessageContext(
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                timezone: TimeZone.current.identifier,
                profilePictureUrl: user.image,
                origin: "mobile"
            ),
            mentions: mentions
        )

        var fragmentBodies: [PostContentFragmentBody] = []

        for fragment in fragments.uploaded {
            fragmentBodies.append(PostContentFragmentBody(
                title: fragment.title,
                fileId: fragment.fileId,
                url: fragment.url,
                nodeId: nil,
                nodeDataSourceViewId: nil,
                context: PostContentFragmentContext(
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    profilePictureUrl: user.image
                )
            ))
        }

        for node in fragments.contentNodes {
            fragmentBodies.append(PostContentFragmentBody(
                title: node.title,
                fileId: nil,
                url: nil,
                nodeId: node.internalId,
                nodeDataSourceViewId: node.dataSourceViewSId,
                context: PostContentFragmentContext(
                    username: user.username,
                    email: user.email,
                    fullName: user.fullName,
                    profilePictureUrl: user.image
                )
            ))
        }

        do {
            let conv = try await appState.apiClient.createConversation(
                domain: appState.domain,
                workspaceId: workspaceId,
                message: messageBody,
                contentFragments: fragmentBodies
            )
            inputVM.reset()
            activeConversationId = conv.sId
        } catch {
            print("Failed to create conversation: \(error)")
        }

        isSending = false
    }
}

// MARK: - Agent Chip View

struct AgentChipView: View {
    let agent: LightAgentConfigurationType
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                AsyncImage(url: URL(string: agent.pictureUrl)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Circle()
                        .fill(Color.blue.opacity(0.2))
                        .overlay(
                            Text(String(agent.name.prefix(1)).uppercased())
                                .font(.caption2.bold())
                                .foregroundStyle(.blue)
                        )
                }
                .frame(width: 22, height: 22)
                .clipShape(Circle())

                Text("@\(agent.name)")
                    .font(.subheadline)
                    .foregroundStyle(.primary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Settings View

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var authService: AuthService

    var body: some View {
        List {
            Section("Account") {
                if let user = authService.currentUser {
                    HStack {
                        AsyncImage(url: URL(string: user.image ?? "")) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Circle()
                                .fill(Color.gray.opacity(0.2))
                                .overlay(
                                    Text(String(user.firstName.prefix(1)).uppercased())
                                        .font(.headline)
                                )
                        }
                        .frame(width: 44, height: 44)
                        .clipShape(Circle())

                        VStack(alignment: .leading) {
                            Text(user.fullName)
                                .font(.headline)
                            Text(user.email)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Workspace") {
                if let workspace = authService.currentUser?.currentWorkspace {
                    HStack {
                        Text(workspace.name)
                        Spacer()
                        Text(workspace.role)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if let workspaces = authService.currentUser?.workspaces, workspaces.count > 1 {
                    NavigationLink("Switch Workspace") {
                        WorkspacePickerView()
                    }
                }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    Task {
                        await authService.logout()
                    }
                }
            }
        }
        .navigationTitle("Settings")
    }
}
