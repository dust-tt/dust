import MarkdownUI
import SparkleTokens
import SwiftUI

struct ConversationDetailView: View {
    let conversation: Conversation
    let currentUserEmail: String
    let onBack: () -> Void

    private let workspaceId: String
    private let tokenProvider: TokenProvider

    @StateObject private var viewModel: ConversationDetailViewModel
    @StateObject private var inputBarViewModel: InputBarViewModel
    @State private var showFilesSheet = false
    @State private var selectedFragment: ContentFragment?

    init(
        conversation: Conversation,
        workspaceId: String,
        tokenProvider: TokenProvider,
        user: User,
        currentUserEmail: String,
        onBack: @escaping () -> Void
    ) {
        self.conversation = conversation
        self.currentUserEmail = currentUserEmail
        self.onBack = onBack
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        _viewModel = StateObject(
            wrappedValue: ConversationDetailViewModel(
                conversation: conversation,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        )
        _inputBarViewModel = StateObject(
            wrappedValue: InputBarViewModel(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider,
                user: user
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            messageList
            InputBarView(
                viewModel: inputBarViewModel,
                conversationId: conversation.sId
            )
        }
        .background(Color.dustBackground)
        .task {
            await viewModel.loadMessages()
        }
        .task {
            await inputBarViewModel.loadAgents()
        }
        .onDisappear {
            inputBarViewModel.cancelUploads()
        }
        .sheet(isPresented: $showFilesSheet) {
            ConversationFilesSheet(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $selectedFragment) { fragment in
            if let fileId = fragment.fileId {
                AttachmentViewerView(
                    title: fragment.title,
                    contentType: fragment.contentType,
                    fileId: fileId,
                    workspaceId: workspaceId,
                    tokenProvider: tokenProvider,
                    sourceUrl: fragment.sourceUrl
                )
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Button(action: onBack) {
                SparkleIcon.chevronLeft.image
                    .resizable()
                    .frame(width: 16, height: 16)
                    .foregroundStyle(Color.dustForeground)
                    .padding(10)
            }
            .liquidGlassCircle()

            Text(conversation.title ?? "New conversation")
                .sparkleCopySm()
                .foregroundStyle(Color.dustForeground)
                .lineLimit(1)
                .truncationMode(.tail)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .liquidGlassCapsule()

            Spacer()

            Button { showFilesSheet = true } label: {
                Image(systemName: "paperclip")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.dustForeground)
                    .frame(width: 36, height: 36)
            }
            .liquidGlassCircle()
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
                                let isStreaming = message.id == viewModel.streamingMessageId
                                MessageBubbleView(
                                    message: message,
                                    currentUserEmail: currentUserEmail,
                                    streamingPhase: isStreaming ? viewModel.streamingPhase : .idle,
                                    activeActions: isStreaming ? viewModel.activeActions : [],
                                    lastError: viewModel.lastError?.messageId == message.id
                                        ? viewModel.lastError : nil,
                                    isValidatingAction: viewModel.isValidatingAction,
                                    onFragmentTap: { fragment in
                                        guard fragment.fileId != nil else { return }
                                        selectedFragment = fragment
                                    },
                                    onValidateAction: { approval in
                                        Task { await viewModel.validateAction(approved: approval) }
                                    },
                                    onRetry: { messageId in
                                        Task { await viewModel.retryMessage(messageId: messageId) }
                                    },
                                    onOpenInBrowser: {
                                        let base = AppConfig.appURL
                                        let path = "/w/\(workspaceId)/assistant/\(conversation.sId)"
                                        if let url = URL(string: base + path) {
                                            UIApplication.shared.open(url)
                                        }
                                    }
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
