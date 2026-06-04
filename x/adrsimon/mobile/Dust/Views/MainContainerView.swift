import SparkleTokens
import SwiftUI

enum ConversationDestination: Hashable {
    case conversation(Conversation)
    case newConversation
    case pod(Space)
    case newPodConversation(Space)
}

struct MainContainerView: View {
    let user: User
    let onLogout: () -> Void

    @EnvironmentObject private var authViewModel: AuthViewModel
    @StateObject private var viewModel: ConversationListViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var navigationPath = NavigationPath()
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
                    navigationPath.append(ConversationDestination.newConversation)
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
            .navigationBarHidden(true)
            .navigationDestination(for: ConversationDestination.self) { destination in
                switch destination {
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

                case .newConversation:
                    if let workspaceId = viewModel.workspace?.sId {
                        NewConversationView(
                            firstName: user.firstName,
                            user: user,
                            workspaceId: workspaceId,
                            tokenProvider: tokenProvider,
                            onConversationCreated: { conversation in
                                navigationPath = NavigationPath([ConversationDestination.conversation(conversation)])
                            }
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
                        navigationPath = NavigationPath()
                        navigationPath.append(ConversationDestination.conversation(conversation))
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

    private var isLoading: Bool {
        switch viewModel.state {
        case .loading:
            true
        case .loaded, .error:
            false
        }
    }
}
