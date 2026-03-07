import SparkleTokens
import SwiftUI

struct MainContainerView: View {
    let user: User
    let onLogout: () -> Void

    @StateObject private var viewModel: ConversationListViewModel
    @State private var isDrawerOpen = false

    init(user: User, accessToken: String, onLogout: @escaping () -> Void) {
        self.user = user
        self.onLogout = onLogout
        _viewModel = StateObject(wrappedValue: ConversationListViewModel(accessToken: accessToken))
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
                        isDrawerOpen = false
                    },
                    onSelectConversation: { _ in
                        isDrawerOpen = false
                    },
                    onSwitchWorkspace: { workspace in
                        Task { await viewModel.switchWorkspace(workspace) }
                    },
                    onLogout: {
                        isDrawerOpen = false
                        onLogout()
                    }
                )
            },
            content: {
                ZStack(alignment: .topLeading) {
                    NewConversationView(firstName: user.firstName)

                    Button {
                        isDrawerOpen = true
                    } label: {
                        Image(systemName: "line.horizontal.3")
                            .font(.title2)
                            .foregroundStyle(Color.dustForeground)
                            .padding(16)
                    }
                }
            }
        )
        .task {
            await viewModel.load()
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
