import MarkdownUI
import SparkleTokens
import SwiftUI

struct ConversationDetailView: View {
    let conversation: Conversation
    let currentUserEmail: String
    let onBack: () -> Void

    @StateObject private var viewModel: ConversationDetailViewModel

    init(
        conversation: Conversation,
        workspaceId: String,
        accessToken: String,
        currentUserEmail: String,
        onBack: @escaping () -> Void
    ) {
        self.conversation = conversation
        self.currentUserEmail = currentUserEmail
        self.onBack = onBack
        _viewModel = StateObject(
            wrappedValue: ConversationDetailViewModel(
                conversation: conversation,
                workspaceId: workspaceId,
                accessToken: accessToken
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            messageList
        }
        .background(Color.dustBackground)
        .task {
            await viewModel.loadMessages()
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.dustForeground)
            }

            Text(conversation.title ?? "New conversation")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Message List

    private var messageList: some View {
        Group {
            switch viewModel.state {
            case .loading:
                VStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }

            case let .error(message):
                VStack {
                    Spacer()
                    Text(message)
                        .sparkleCopySm()
                        .foregroundStyle(Color.dustFaint)
                        .multilineTextAlignment(.center)
                        .padding()
                    Button("Retry") {
                        Task { await viewModel.loadMessages() }
                    }
                    Spacer()
                }

            case .loaded:
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            if viewModel.hasMore {
                                Button {
                                    Task { await viewModel.loadMore() }
                                } label: {
                                    Text("Load earlier messages")
                                        .sparkleCopyXs()
                                        .foregroundStyle(Color.dustFaint)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                }
                            }

                            ForEach(viewModel.messages) { message in
                                MessageBubbleView(
                                    message: message,
                                    currentUserEmail: currentUserEmail,
                                    streamingPhase: message.id == viewModel.streamingMessageId
                                        ? viewModel.streamingPhase
                                        : .idle
                                )
                                .id(message.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    }
                    .defaultScrollAnchor(.bottom)
                    .onChange(of: viewModel.messages.last?.id) {
                        if let last = viewModel.messages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
