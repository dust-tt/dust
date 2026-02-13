import SwiftUI

struct ConversationListView: View {
    @EnvironmentObject var appState: AppState
    @State private var viewModel: ConversationListViewModel?

    var body: some View {
        Group {
            if let viewModel {
                if viewModel.isLoading && viewModel.conversations.isEmpty {
                    LoadingView(message: "Loading conversations...")
                } else if viewModel.conversations.isEmpty {
                    EmptyStateView(
                        title: "No Conversations",
                        message: "Start a new conversation with an agent.",
                        systemImage: "bubble.left.and.bubble.right"
                    )
                } else {
                    List(viewModel.conversations, id: \.sId) { conversation in
                        NavigationLink(value: conversation.sId) {
                            ConversationRowView(conversation: conversation)
                        }
                    }
                    .listStyle(.plain)
                }
            } else {
                LoadingView(message: "Loading conversations...")
            }
        }
        .navigationTitle("Conversations")
        .navigationDestination(for: String.self) { conversationId in
            ConversationDetailView(appState: appState, conversationId: conversationId)
        }
        .refreshable {
            await viewModel?.refresh()
        }
        .task {
            if viewModel == nil {
                viewModel = ConversationListViewModel(appState: appState)
            }
            await viewModel?.loadConversations()
        }
        .overlay {
            if let error = viewModel?.error {
                ErrorView(message: error) {
                    Task { await viewModel?.refresh() }
                }
            }
        }
    }
}

struct ConversationRowView: View {
    let conversation: ConversationWithoutContent

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(conversation.title ?? "Untitled")
                    .font(.subheadline.bold())
                    .lineLimit(1)

                Spacer()

                if conversation.unread {
                    Circle()
                        .fill(.blue)
                        .frame(width: 8, height: 8)
                }
            }

            Text(Date(timeIntervalSince1970: TimeInterval(conversation.created / 1000)).formatted(.relative(presentation: .named)))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
