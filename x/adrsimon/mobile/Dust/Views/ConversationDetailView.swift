import MarkdownUI
import SparkleTokens
import SwiftUI

struct ConversationDetailView: View {
    let conversation: Conversation
    let currentUserEmail: String

    private let workspaceId: String
    private let tokenProvider: TokenProvider

    @StateObject private var viewModel: ConversationDetailViewModel
    @StateObject private var inputBarViewModel: InputBarViewModel
    @State private var showFilesSheet = false
    @State private var selectedFragment: ContentFragment?
    @State private var selectedGeneratedFile: GeneratedFile?

    init(
        conversation: Conversation,
        workspaceId: String,
        tokenProvider: TokenProvider,
        user: User,
        currentUserEmail: String
    ) {
        self.conversation = conversation
        self.currentUserEmail = currentUserEmail
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
            messageList
            InputBarView(
                viewModel: inputBarViewModel,
                conversationId: conversation.sId
            )
        }
        .background(Color.dustBackground)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(conversation.title ?? "New conversation")
                    .sparkleCopySm()
                    .foregroundStyle(Color.dustForeground)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showFilesSheet = true } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 16))
                        .foregroundStyle(Color.dustForeground)
                }
            }
        }
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
        .sheet(item: $selectedGeneratedFile) { file in
            AttachmentViewerView(
                title: file.title,
                contentType: file.contentType,
                fileId: file.fileId,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider,
                sourceUrl: nil
            )
        }
    }

    // MARK: - Steering Detection

    /// Returns true if the agent message at the given index is a steered follow-up
    /// (i.e., the previous agent message with the same configuration was gracefully stopped).
    private func isSteeredAgentMessage(at index: Int) -> Bool {
        guard case let .agent(agentMsg) = viewModel.messages[index] else { return false }
        for i in stride(from: index - 1, through: 0, by: -1) {
            if case let .agent(prevAgent) = viewModel.messages[i] {
                return prevAgent.status == .gracefullyStopped
                    && prevAgent.configuration.sId == agentMsg.configuration.sId
            }
        }
        return false
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

                            ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, message in
                                let isStreaming = message.id == viewModel.streamingMessageId
                                let hideAgentHeader = isSteeredAgentMessage(at: index)
                                MessageBubbleView(
                                    message: message,
                                    currentUserEmail: currentUserEmail,
                                    streamingPhase: isStreaming ? viewModel.streamingPhase : .idle,
                                    activeActions: isStreaming ? viewModel.activeActions : [],
                                    completedSteps: isStreaming ? viewModel.completedSteps : [],
                                    lastError: viewModel.lastError?.messageId == message.id
                                        ? viewModel.lastError : nil,
                                    isValidatingAction: viewModel.isValidatingAction,
                                    hideAgentHeader: hideAgentHeader,
                                    onFragmentTap: { fragment in
                                        guard fragment.fileId != nil else { return }
                                        selectedFragment = fragment
                                    },
                                    onGeneratedFileTap: { file in
                                        selectedGeneratedFile = file
                                    },
                                    onCitationTap: { citation in
                                        guard let href = citation.href,
                                              let url = URL(string: href) else { return }
                                        UIApplication.shared.open(url)
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
