import SparkleTokens
import SwiftUI

enum ConversationDestination: Hashable {
    case compose
    case conversation(Conversation)
    case pod(Space)
    case newPodConversation(Space)
}

struct MainContainerView: View {
    let user: User
    let onLogout: () -> Void

    @EnvironmentObject private var authViewModel: AuthViewModel
    @StateObject private var viewModel: ConversationListViewModel
    @Environment(\.scenePhase) private var scenePhase
    // List is the nav root; compose is pushed so we land on compose and swipe-back reveals the list.
    @State private var navigationPath = NavigationPath([ConversationDestination.compose])
    @State private var showCatchUp = false

    private let tokenProvider: TokenProvider

    init(user: User, tokenProvider: TokenProvider, onLogout: @escaping () -> Void) {
        self.user = user
        self.tokenProvider = tokenProvider
        self.onLogout = onLogout
        _viewModel = StateObject(wrappedValue: ConversationListViewModel(tokenProvider: tokenProvider))
    }

    var body: some View {
        if isLoading {
            LoadingView()
                .task {
                    await viewModel.load()
                }
        } else {
            mainContent
        }
    }

    private var mainContent: some View {
        NavigationStack(path: $navigationPath) {
            conversationList
                .navigationBarHidden(true)
                .navigationDestination(for: ConversationDestination.self) { destination in
                    destinationView(for: destination)
                }
        }
        .fullScreenCover(isPresented: $showCatchUp) {
            if let workspaceId = viewModel.workspace?.sId {
                CatchUpView(
                    conversations: viewModel.unreadConversations,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    currentUserEmail: user.email,
                    onDismiss: { markedIds in
                        showCatchUp = false
                        viewModel.markConversationsAsRead(markedIds)
                    },
                    onOpenConversation: { conversation in
                        showCatchUp = false
                        navigationPath = NavigationPath([ConversationDestination.conversation(conversation)])
                    }
                )
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { authViewModel.pendingFrameToken != nil },
            set: { if !$0 { authViewModel.pendingFrameToken = nil } }
        )) {
            if let token = authViewModel.pendingFrameToken {
                FrameVisualizerView(frameToken: token)
            }
        }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Task { await viewModel.refresh() }
            }
        }
    }

    // MARK: - Root: conversation list

    private var conversationList: some View {
        ConversationListView(
            searchText: $viewModel.searchText,
            groupedConversations: viewModel.groupedConversations,
            pods: viewModel.pods,
            isPodsExpanded: $viewModel.isPodsExpanded,
            user: user,
            currentWorkspace: viewModel.workspace,
            workspaces: viewModel.workspaces,
            isLoading: isLoading,
            onNewConversation: {
                navigationPath.append(ConversationDestination.compose)
            },
            onSelectConversation: { conversation in
                navigationPath.append(ConversationDestination.conversation(conversation))
            },
            onSelectPod: { pod in
                navigationPath.append(ConversationDestination.pod(pod))
            },
            onSwitchWorkspace: { workspace in
                navigationPath = NavigationPath()
                Task { await viewModel.switchWorkspace(workspace) }
            },
            onToggleReadStatus: { conversation in
                Task { await viewModel.toggleReadStatus(for: conversation) }
            },
            onDelete: { conversation in
                Task { await viewModel.deleteConversation(conversation) }
            },
            onLogout: onLogout,
            onCatchUp: viewModel.unreadConversations.isEmpty ? nil : {
                showCatchUp = true
            },
            onRefresh: {
                await viewModel.refresh()
            }
        )
    }

    // MARK: - Pushed destinations

    @ViewBuilder
    private func destinationView(for destination: ConversationDestination) -> some View {
        switch destination {
        case .compose:
            if let workspaceId = viewModel.workspace?.sId {
                NewConversationView(
                    firstName: user.firstName,
                    user: user,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    autoFocus: true,
                    onConversationCreated: { conversation in
                        // Replace compose so back returns to the list.
                        navigationPath = NavigationPath([ConversationDestination.conversation(conversation)])
                    }
                )
                .id(workspaceId)
            }

        case let .conversation(conversation):
            if let workspaceId = viewModel.workspace?.sId {
                ConversationDetailView(
                    conversation: conversation,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    user: user,
                    currentUserEmail: user.email
                )
            }

        case let .pod(space):
            if let workspaceId = viewModel.workspace?.sId {
                PodConversationsView(
                    space: space,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    onSelectConversation: { conversation in
                        navigationPath.append(ConversationDestination.conversation(conversation))
                    },
                    onNewConversation: {
                        navigationPath.append(ConversationDestination.newPodConversation(space))
                    }
                )
            }

        case let .newPodConversation(space):
            if let workspaceId = viewModel.workspace?.sId {
                NewConversationView(
                    firstName: user.firstName,
                    user: user,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    spaceId: space.sId,
                    onConversationCreated: { conversation in
                        navigationPath = NavigationPath([
                            ConversationDestination.pod(space),
                            ConversationDestination.conversation(conversation),
                        ])
                    }
                )
            }
        }
    }

    private var isLoading: Bool {
        switch viewModel.state {
        case .loading:
            true
        case .loaded, .error:
            false
        }
    }
}
