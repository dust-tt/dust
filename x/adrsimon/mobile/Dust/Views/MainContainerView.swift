import SparkleTokens
import SwiftUI

struct MainContainerView: View {
    let user: User
    let onLogout: () -> Void

    @StateObject private var viewModel: ConversationListViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var isDrawerOpen = false
    @State private var selectedConversation: Conversation?

    private let tokenProvider: TokenProvider

    init(user: User, tokenProvider: TokenProvider, onLogout: @escaping () -> Void) {
        self.user = user
        self.tokenProvider = tokenProvider
        self.onLogout = onLogout
        _viewModel = StateObject(wrappedValue: ConversationListViewModel(tokenProvider: tokenProvider))
    }

    var body: some View {
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
                            onBack: {
                                selectedConversation = nil
                                Task { await viewModel.refresh() }
                            }
                        )
                        .id(conversation.sId)
                    } else if let workspaceId = viewModel.workspace?.sId {
                        NewConversationView(
                            firstName: user.firstName,
                            user: user,
                            workspaceId: workspaceId,
                            tokenProvider: tokenProvider,
                            onConversationCreated: { conversation in
                                selectedConversation = conversation
                            }
                        )
                    }

                    if selectedConversation == nil {
                        Button {
                            isDrawerOpen = true
                        } label: {
                            SparkleIcon.menu.image
                                .resizable()
                                .frame(width: 24, height: 24)
                                .foregroundStyle(Color.dustForeground)
                                .padding(16)
                        }
                    }
                }
            }
        )
        .task {
            await viewModel.load()
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
