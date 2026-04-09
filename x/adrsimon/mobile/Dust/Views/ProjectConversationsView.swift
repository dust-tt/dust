import SparkleTokens
import SwiftUI

struct ProjectConversationsView: View {
    let space: Space
    let onSelectConversation: (Conversation) -> Void
    let onNewConversation: () -> Void

    @StateObject private var viewModel: ProjectConversationsViewModel

    init(
        space: Space,
        workspaceId: String,
        tokenProvider: TokenProvider,
        onSelectConversation: @escaping (Conversation) -> Void,
        onNewConversation: @escaping () -> Void
    ) {
        self.space = space
        self.onSelectConversation = onSelectConversation
        self.onNewConversation = onNewConversation
        _viewModel = StateObject(
            wrappedValue: ProjectConversationsViewModel(
                space: space,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            conversationListSection
        }
        .background(Color.dustBackground)
        .safeAreaInset(edge: .bottom) {
            ConversationListBottomBar(
                searchText: $viewModel.searchText,
                onNewConversation: onNewConversation
            )
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(space.name)
                    .sparkleLabelSm()
                    .foregroundStyle(Color.dustForeground)
            }
        }
        .task {
            await viewModel.load()
        }
    }

    // MARK: - Conversation List

    private var conversationListSection: some View {
        ScrollView {
            if isLoading {
                ProgressView()
                    .padding(.top, 32)
            } else if viewModel.groupedConversations.isEmpty {
                if viewModel.searchText.isEmpty {
                    ContentUnavailableView(
                        "No conversations yet",
                        systemImage: "bubble.left.and.bubble.right"
                    )
                    .padding(.top, 32)
                } else {
                    ContentUnavailableView.search(text: viewModel.searchText)
                        .padding(.top, 32)
                }
            } else {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(viewModel.groupedConversations, id: \.0) { group, conversations in
                        Section {
                            ForEach(conversations) { conversation in
                                Button {
                                    onSelectConversation(conversation)
                                } label: {
                                    ConversationRowView(conversation: conversation)
                                }
                            }
                        } header: {
                            Text(group)
                                .sparkleLabelXs()
                                .textCase(.uppercase)
                                .foregroundStyle(Color.dustFaint)
                                .padding(.horizontal, 12)
                                .padding(.top, 16)
                                .padding(.bottom, 4)
                        }
                    }
                }
            }
        }
        .refreshable {
            await viewModel.refresh()
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
