import Foundation

@MainActor
@Observable
class ConversationViewModel {
    var conversation: ConversationPublicType?
    var messageStates: [String: AgentMessageState] = [:]
    var isLoading = false
    var error: String?
    var isSending = false

    @ObservationIgnored private let appState: AppState
    @ObservationIgnored private let conversationId: String
    @ObservationIgnored private var conversationStreamTask: Task<Void, Never>?
    @ObservationIgnored private var messageStreamTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private let sseClient = SSEClient()

    init(appState: AppState, conversationId: String) {
        self.appState = appState
        self.conversationId = conversationId
    }

    deinit {
        conversationStreamTask?.cancel()
        messageStreamTasks.values.forEach { $0.cancel() }
    }

    // MARK: - Load conversation

    func loadConversation() async {
        guard let workspaceId = appState.workspaceId else { return }

        isLoading = true
        error = nil

        do {
            let conv = try await appState.apiClient.getConversation(
                domain: appState.domain,
                workspaceId: workspaceId,
                conversationId: conversationId
            )
            conversation = conv

            // Initialize message states for agent messages
            for group in conv.content {
                for message in group {
                    if case .agentMessage(let agentMsg) = message {
                        if messageStates[agentMsg.sId] == nil {
                            let state = AgentMessageState(message: agentMsg)
                            messageStates[agentMsg.sId] = state

                            // Start streaming for in-progress messages
                            if agentMsg.status == "created" {
                                startMessageStream(messageId: agentMsg.sId)
                            }
                        }
                    }
                }
            }

            // Start conversation-level stream
            startConversationStream()
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Flattened messages for display

    var flatMessages: [MessageUnion] {
        guard let conversation else { return [] }
        return conversation.content.flatMap { $0 }
    }

    // MARK: - Conversation-level SSE stream

    private func startConversationStream() {
        conversationStreamTask?.cancel()
        conversationStreamTask = Task { [weak self] in
            guard let self else { return }
            await self.runConversationStream()
        }
    }

    private func runConversationStream() async {
        guard let workspaceId = appState.workspaceId else { return }

        var reconnectAttempts = 0
        var lastEventData: String?

        while !Task.isCancelled && reconnectAttempts < DustConfig.sseMaxReconnectAttempts {
            do {
                let path = APIEndpoints.conversationEvents(
                    workspaceId: workspaceId,
                    conversationId: conversationId
                )
                let request = try await appState.apiClient.buildSSERequest(
                    domain: appState.domain,
                    path: path,
                    lastEventId: lastEventData
                )

                let stream = await sseClient.stream(for: request)

                for try await data in stream {
                    if Task.isCancelled { return }

                    reconnectAttempts = 0

                    if data == "done" {
                        // Stream batch done, reconnect immediately
                        break
                    }

                    lastEventData = data

                    if let event = SSEEventParser.parseConversationEvent(from: data) {
                        handleConversationEvent(event)
                    }
                }
            } catch {
                if Task.isCancelled { return }
                reconnectAttempts += 1
                try? await Task.sleep(nanoseconds: UInt64(DustConfig.sseReconnectDelay * 1_000_000_000))
            }
        }
    }

    private func handleConversationEvent(_ event: ConversationStreamEvent) {
        switch event {
        case .userMessageNew(let e):
            addMessageToConversation(.userMessage(e.message))

        case .agentMessageNew(let e):
            addMessageToConversation(.agentMessage(e.message))

            // Create state tracker and start streaming for the new agent message
            let state = AgentMessageState(message: e.message)
            messageStates[e.message.sId] = state
            startMessageStream(messageId: e.message.sId)

        case .conversationTitle(let e):
            conversation?.title = e.title

        case .agentGenerationCancelled(let e):
            messageStates[e.messageId]?.apply(event: .agentGenerationCancelled(e))

        case .done:
            break

        case .unknown:
            break
        }
    }

    private func addMessageToConversation(_ message: MessageUnion) {
        guard conversation != nil else { return }

        // Check if already exists
        let exists = conversation?.content.contains { group in
            group.contains { $0.sId == message.sId }
        } ?? false

        if !exists {
            conversation?.content.append([message])
        }
    }

    // MARK: - Per-message SSE stream

    private func startMessageStream(messageId: String) {
        messageStreamTasks[messageId]?.cancel()
        messageStreamTasks[messageId] = Task { [weak self] in
            guard let self else { return }
            await self.runMessageStream(messageId: messageId)
        }
    }

    private func runMessageStream(messageId: String) async {
        guard let workspaceId = appState.workspaceId else { return }

        var reconnectAttempts = 0

        while !Task.isCancelled && reconnectAttempts < DustConfig.sseMaxReconnectAttempts {
            do {
                let path = APIEndpoints.messageEvents(
                    workspaceId: workspaceId,
                    conversationId: conversationId,
                    messageId: messageId
                )
                let request = try await appState.apiClient.buildSSERequest(
                    domain: appState.domain,
                    path: path
                )

                let stream = await sseClient.stream(for: request)

                for try await data in stream {
                    if Task.isCancelled { return }

                    reconnectAttempts = 0

                    if data == "done" {
                        // Message stream completed
                        messageStates[messageId]?.apply(event: .done)
                        messageStreamTasks[messageId] = nil
                        return
                    }

                    if let event = SSEEventParser.parseMessageEvent(from: data) {
                        messageStates[messageId]?.apply(event: event)

                        // If the message is done, stop streaming
                        if case .agentMessageSuccess = event {
                            messageStreamTasks[messageId] = nil
                            return
                        }
                    }
                }

                // Stream ended without "done" - message might be complete
                if messageStates[messageId]?.agentState == .done {
                    messageStreamTasks[messageId] = nil
                    return
                }

            } catch {
                if Task.isCancelled { return }
                reconnectAttempts += 1
                try? await Task.sleep(nanoseconds: UInt64(DustConfig.sseReconnectDelay * 1_000_000_000))
            }
        }
    }

    // MARK: - Send message

    func sendMessage(
        content: String,
        mentions: [AgentMentionType],
        contentFragments: ContentFragments = ContentFragments()
    ) async {
        guard let workspaceId = appState.workspaceId,
              let user = appState.authService.currentUser else { return }

        isSending = true
        error = nil

        let messageBody = PostMessageBody(
            content: content,
            context: PostMessageContext(
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                timezone: TimeZone.current.identifier,
                profilePictureUrl: user.image,
                origin: "mobile"
            ),
            mentions: mentions
        )

        do {
            // Post content fragments first if any
            var fragmentBodies: [PostContentFragmentBody] = []

            for fragment in contentFragments.uploaded {
                fragmentBodies.append(PostContentFragmentBody(
                    title: fragment.title,
                    fileId: fragment.fileId,
                    url: fragment.url,
                    nodeId: nil,
                    nodeDataSourceViewId: nil,
                    context: PostContentFragmentContext(
                        username: user.username,
                        email: user.email,
                        fullName: user.fullName,
                        profilePictureUrl: user.image
                    )
                ))
            }

            for node in contentFragments.contentNodes {
                fragmentBodies.append(PostContentFragmentBody(
                    title: node.title,
                    fileId: nil,
                    url: nil,
                    nodeId: node.internalId,
                    nodeDataSourceViewId: node.dataSourceViewSId,
                    context: PostContentFragmentContext(
                        username: user.username,
                        email: user.email,
                        fullName: user.fullName,
                        profilePictureUrl: user.image
                    )
                ))
            }

            // Post content fragments for existing conversation
            for body in fragmentBodies {
                _ = try await appState.apiClient.postContentFragment(
                    domain: appState.domain,
                    workspaceId: workspaceId,
                    conversationId: conversationId,
                    fragment: body
                )
            }

            // Post message
            let userMessage = try await appState.apiClient.postMessage(
                domain: appState.domain,
                workspaceId: workspaceId,
                conversationId: conversationId,
                message: messageBody
            )

            // Add to conversation optimistically
            addMessageToConversation(.userMessage(userMessage))
        } catch {
            self.error = error.localizedDescription
        }

        isSending = false
    }

    // MARK: - Retry

    func retryMessage(messageId: String) async {
        guard let workspaceId = appState.workspaceId else { return }

        do {
            try await appState.apiClient.retryMessage(
                domain: appState.domain,
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Feedback

    func submitFeedback(messageId: String, thumbDirection: String, content: String? = nil) async {
        guard let workspaceId = appState.workspaceId else { return }

        do {
            try await appState.apiClient.postFeedback(
                domain: appState.domain,
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId,
                thumbDirection: thumbDirection,
                content: content
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Cleanup

    func stopStreaming() {
        conversationStreamTask?.cancel()
        conversationStreamTask = nil
        messageStreamTasks.values.forEach { $0.cancel() }
        messageStreamTasks.removeAll()
    }
}
