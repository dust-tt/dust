import SparkleTokens
import SwiftUI

struct MainContainerView: View {
    let user: User
    let onLogout: () -> Void

    @EnvironmentObject private var authViewModel: AuthViewModel
    @StateObject private var viewModel: ConversationListViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var isDrawerOpen = false
    @State private var selectedConversation: Conversation?
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
        NavigationDrawerContainer(
            isOpen: $isDrawerOpen,
            drawer: {
                DrawerView(
                    searchText: $viewModel.searchText,
                    groupedConversations: viewModel.groupedConversations,
                    user: user,
                    currentWorkspace: viewModel.workspace,
                    workspaces: viewModel.workspaces,
                    isLoading: isLoading,
                    onNewConversation: {
                        selectedConversation = nil
                        isDrawerOpen = false
                    },
                    onSelectConversation: { conversation in
                        selectedConversation = conversation
                        isDrawerOpen = false
                    },
                    onSwitchWorkspace: { workspace in
                        selectedConversation = nil
                        Task { await viewModel.switchWorkspace(workspace) }
                    },
                    onLogout: {
                        isDrawerOpen = false
                        onLogout()
                    },
                    onCatchUp: viewModel.unreadConversations.isEmpty ? nil : {
                        showCatchUp = true
                        isDrawerOpen = false
                    },
                    onRefresh: {
                        await viewModel.refresh()
                    }
                )
            },
            content: {
                ZStack(alignment: .topLeading) {
                    if let conversation = selectedConversation,
                       let workspaceId = viewModel.workspace?.sId
                    {
                        ConversationDetailView(
                            conversation: conversation,
                            workspaceId: workspaceId,
                            tokenProvider: tokenProvider,
                            user: user,
                            currentUserEmail: user.email,
                            onMenu: {
                                isDrawerOpen = true
                            }
                        )
                        .id(conversation.sId)
                    } else if let workspaceId = viewModel.workspace?.sId {
                        ZStack(alignment: .topLeading) {
                            NewConversationView(
                                firstName: user.firstName,
                                user: user,
                                workspaceId: workspaceId,
                                tokenProvider: tokenProvider,
                                onConversationCreated: { conversation in
                                    selectedConversation = conversation
                                }
                            )

                            Button {
                                isDrawerOpen = true
                            } label: {
                                SparkleIcon.menu.image
                                    .resizable()
                                    .frame(width: 24, height: 24)
                                    .foregroundStyle(Color.dustForeground)
                                    .padding(12)
                            }
                            .liquidGlassCircle()
                            .padding(4)
                        }
                    }
                }
            }
        )
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
                        selectedConversation = conversation
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
