import SparkleTokens
import SwiftUI

struct PodConversationsView: View {
    let space: Space
    let workspaceId: String
    let tokenProvider: TokenProvider
    let onSelectConversation: (Conversation) -> Void
    let onNewConversation: () -> Void

    @StateObject private var viewModel: PodConversationsViewModel
    @State private var showFilesSheet = false

    init(
        space: Space,
        workspaceId: String,
        tokenProvider: TokenProvider,
        onSelectConversation: @escaping (Conversation) -> Void,
        onNewConversation: @escaping () -> Void
    ) {
        self.space = space
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.onSelectConversation = onSelectConversation
        self.onNewConversation = onNewConversation
        _viewModel = StateObject(
            wrappedValue: PodConversationsViewModel(
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
            ToolbarItem(placement: .topBarTrailing) {
                Button { showFilesSheet = true } label: {
                    Image(systemName: "folder")
                        .font(.system(size: 16))
                        .foregroundStyle(Color.dustForeground)
                }
            }
        }
        .task {
            await viewModel.load()
        }
        .sheet(isPresented: $showFilesSheet) {
            PodFilesSheet(
                workspaceId: workspaceId,
                spaceId: space.sId,
                tokenProvider: tokenProvider
            )
            .presentationDetents([.medium, .large])
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
                                    PodConversationRowView(
                                        title: conversation.title ?? "New conversation",
                                        snippet: conversation.preview?.snippet,
                                        avatarUrls: conversation.preview?.participantAvatarUrls ?? [],
                                        isUnread: conversation.unread
                                    )
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        } header: {
                            Text(group)
                                .sparkleLabelXs()
                                .textCase(.uppercase)
                                .foregroundStyle(Color.dustFaint)
                                .padding(.horizontal, 16)
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
