import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "ConversationDetail")

@MainActor
// swiftlint:disable:next type_body_length
final class ConversationDetailViewModel: ObservableObject {
    enum State {
        case loading
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var messages: [ConversationMessage] = []
    @Published var hasMore = false

    /// Live reduction of the currently streaming agent message (nil when not streaming).
    @Published var turn: AgentMessageStream?
    /// What the agent is blocked on, if anything. Outlives `turn` until resolved.
    @Published var blockedState: BlockedState?
    /// sId of the message currently being streamed.
    @Published var streamingMessageId: String?
    /// Error info for the last failed agent message (if any).
    @Published var lastError: ErrorInfo?
    /// Whether a validate-action request is in-flight.
    @Published var isValidatingAction = false

    var streamingPhase: AgentStreamingPhase {
        if let blockedState { return blockedState.asPhase }
        switch turn?.snapshot.activity {
        case .thinking: return .thinking
        case .generating: return .generating
        case nil: return .idle
        }
    }

    var activeActions: [ActiveAction] {
        turn?.snapshot.activeActions ?? []
    }

    var completedSteps: [ActivityStep] {
        turn?.snapshot.completedSteps ?? []
    }

    /// Overlays the streaming message with its live snapshot until finalize commits it.
    func renderMessage(_ message: ConversationMessage) -> ConversationMessage {
        guard case let .agent(agent) = message,
              let snapshot = turn?.snapshot, snapshot.messageId == agent.sId
        else { return message }
        var merged = agent
        merged.content = snapshot.content.isEmpty ? agent.content : snapshot.content
        merged.chainOfThought = snapshot.chainOfThought
        return .agent(merged)
    }

    private let conversation: Conversation
    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private var lastValue: Int?
    /// Monotonic counter to identify the active message stream generation.
    private var streamGeneration: UInt64 = 0

    // Streaming tasks
    private var conversationEventsTask: Task<Void, Never>?
    private var messageStreamTask: Task<Void, Never>?
    private var markAsReadTask: Task<Void, Never>?

    init(conversation: Conversation, workspaceId: String, tokenProvider: TokenProvider) {
        self.conversation = conversation
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
    }

    deinit {
        conversationEventsTask?.cancel()
        messageStreamTask?.cancel()
        markAsReadTask?.cancel()
    }

    // MARK: - Message Loading

    func loadMessages() async {
        state = .loading
        do {
            let response = try await ConversationService.fetchMessages(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider
            )
            messages = response.messages.sorted(by: ConversationMessage.byRank)
            hasMore = response.hasMore
            lastValue = response.lastValue
            state = .loaded

            startStreamingIfNeeded()
            startConversationEvents()
            await reconcileBlockedActions()

            markAsRead()
        } catch {
            logger.error("Failed to load messages: \(error)")
            state = .error(error.localizedDescription)
        }
    }

    func loadMore() async {
        guard hasMore, let lastValue else { return }
        do {
            let response = try await ConversationService.fetchMessages(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider,
                lastValue: lastValue
            )
            messages.append(contentsOf: response.messages)
            messages.sort(by: ConversationMessage.byRank)
            hasMore = response.hasMore
            self.lastValue = response.lastValue
        } catch {
            logger.error("Failed to load more messages: \(error)")
        }
    }

    // MARK: - Mark as Read

    private func markAsRead() {
        guard conversation.unread else { return }

        markAsReadTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await ConversationService.markAsRead(
                    workspaceId: workspaceId,
                    conversationId: conversation.sId,
                    tokenProvider: tokenProvider
                )
            } catch {
                logger.error("Failed to mark conversation as read: \(error)")
            }
        }
    }

    // MARK: - Conversation Events (detect new messages)

    private func startConversationEvents() {
        conversationEventsTask?.cancel()
        conversationEventsTask = Task { [weak self, workspaceId, conversationId = conversation.sId, tokenProvider] in
            var retryDelay: UInt64 = 1_000_000_000 // 1s
            let maxDelay: UInt64 = 30_000_000_000 // 30s

            while !Task.isCancelled {
                let endpoint = AppConfig.Endpoints.conversationEvents(
                    workspaceId: workspaceId,
                    conversationId: conversationId
                )

                let stream = StreamingService.eventStream(
                    endpoint: endpoint,
                    tokenProvider: tokenProvider
                )

                let decoder = JSONDecoder()

                do {
                    for try await payload in stream {
                        guard !Task.isCancelled else { return }
                        retryDelay = 1_000_000_000 // reset on success
                        guard let data = payload.data(using: .utf8) else { continue }

                        do {
                            let envelope = try decoder.decode(ConversationEventEnvelope.self, from: data)
                            await self?.handleConversationEvent(envelope.data)
                        } catch {
                            logger.debug("Skipping unhandled conversation event: \(error)")
                        }
                    }
                } catch {
                    if Task.isCancelled { return }
                    logger.error(
                        "Conversation events stream error: \(error), retrying in \(retryDelay / 1_000_000_000)s"
                    )
                }

                try? await Task.sleep(for: .nanoseconds(retryDelay))
                retryDelay = min(retryDelay * 2, maxDelay)
            }
        }
    }

    private func handleConversationEvent(_ event: ConversationEventData) async {
        switch event {
        case let .agentMessageNew(newEvent):
            insertMessageIfNew(.agent(newEvent.message))
            startMessageStream(for: newEvent.message.sId)

        case let .userMessageNew(newEvent):
            removeOptimisticUserMessage()
            insertMessageIfNew(.user(newEvent.message))

        case let .userMessagePromoted(event):
            updateUserMessage(id: event.messageId) { msg in
                msg.visibility = "visible"
            }

        case .agentMessageDone, .conversationTitle, .unknown:
            break
        }
    }

    private func insertMessageIfNew(_ msg: ConversationMessage) {
        guard !messages.contains(where: { $0.id == msg.id }) else { return }
        messages.append(msg)
        messages.sort(by: ConversationMessage.byRank)
    }

    // MARK: - Optimistic User Message

    private var optimisticUserMessageId: String?

    func addOptimisticUserMessage(content: String, userEmail: String) {
        removeOptimisticUserMessage()
        let sId = "pending-\(UUID().uuidString)"
        let nextRank = (messages.map(\.rank).max() ?? 0) + 1
        let message = UserMessage(
            id: 0,
            sId: sId,
            type: .userMessage,
            created: Date().timeIntervalSince1970 * 1000,
            visibility: "visible",
            version: 0,
            rank: nextRank,
            content: content,
            user: nil,
            context: UserMessageContext(username: nil, fullName: nil, email: userEmail, profilePictureUrl: nil),
            contentFragments: nil
        )
        optimisticUserMessageId = sId
        messages.append(.user(message))
        messages.sort(by: ConversationMessage.byRank)
    }

    func removeOptimisticUserMessage() {
        guard let id = optimisticUserMessageId else { return }
        messages.removeAll { $0.id == id }
        optimisticUserMessageId = nil
    }

    // MARK: - Message Streaming (tokens, thinking, actions)

    /// Find any in-progress agent message and start streaming it.
    private func startStreamingIfNeeded() {
        for message in messages {
            if case let .agent(agentMsg) = message, agentMsg.isStreaming {
                startMessageStream(for: agentMsg.sId)
                return
            }
        }
    }

    private func startMessageStream(for messageId: String) {
        if streamingMessageId == messageId { return }

        messageStreamTask?.cancel()
        streamGeneration += 1
        let currentGeneration = streamGeneration
        streamingMessageId = messageId
        turn = AgentMessageStream(messageId: messageId)
        blockedState = nil
        lastError = nil

        messageStreamTask = Task { [weak self, workspaceId, conversationId = conversation.sId, tokenProvider] in
            let endpoint = AppConfig.Endpoints.messageEvents(
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId
            )

            let stream = StreamingService.eventStream(
                endpoint: endpoint,
                tokenProvider: tokenProvider
            )

            let decoder = JSONDecoder()

            do {
                for try await payload in stream {
                    guard !Task.isCancelled else { break }
                    guard let data = payload.data(using: .utf8) else { continue }

                    do {
                        let envelope = try decoder.decode(SSEEnvelope.self, from: data)
                        await self?.reduce(envelope.data, messageId: messageId)
                    } catch {
                        logger.debug("Skipping unhandled message event: \(error)")
                    }
                }
            } catch {
                if !Task.isCancelled {
                    logger.error("Message stream error for \(messageId): \(error)")
                }
            }

            // Stream ended — only clean up if we're still the active generation and not
            // blocked (approval/auth keep their turn alive until the user resolves them).
            guard let self else { return }
            if streamGeneration == currentGeneration, blockedState == nil {
                turn = nil
                streamingMessageId = nil
            }
        }
    }

    /// Blocking events seed `blockedState`; everything else drives the reducer.
    private func reduce(_ event: StreamingEventData, messageId: String) {
        switch event {
        case let .toolApproveExecution(event):
            blockedState = .approval(ToolApprovalInfo(
                from: event,
                fallbackMessageId: messageId,
                fallbackConversationId: conversation.sId
            ))

        case let .toolPersonalAuthRequired(event):
            blockedState = .personalAuth(
                provider: event.authError.provider,
                toolName: event.authError.toolName
            )

        case let .toolFileAuthRequired(event):
            blockedState = .fileAuth(
                fileName: event.fileAuthError.fileName,
                toolName: event.fileAuthError.toolName
            )

        default:
            turn?.apply(event)
            if let snapshot = turn?.snapshot, snapshot.isFinished {
                commitFinishedTurn(snapshot)
            }
        }
    }

    private func commitFinishedTurn(_ snapshot: AgentMessageStream.Snapshot) {
        updateAgentMessage(id: snapshot.messageId) { msg in
            msg.content = snapshot.content.isEmpty ? msg.content : snapshot.content
            msg.chainOfThought = snapshot.chainOfThought
            if let files = snapshot.generatedFiles { msg.generatedFiles = files }
            if let citations = snapshot.citations { msg.citations = citations }
            if let status = snapshot.status { msg.status = status }
        }
        lastError = snapshot.error
        turn = nil
        streamingMessageId = nil
    }

    private func updateUserMessage(id: String, mutate: (inout UserMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }),
              case var .user(userMsg) = messages[index]
        else { return }

        mutate(&userMsg)
        messages[index] = .user(userMsg)
    }

    private func updateAgentMessage(id: String, mutate: (inout AgentMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }),
              case var .agent(agentMsg) = messages[index]
        else { return }

        mutate(&agentMsg)
        messages[index] = .agent(agentMsg)
    }

    // MARK: - Tool Approval

    func validateAction(approved: ActionApproval) async {
        guard case let .approval(info) = blockedState else { return }
        isValidatingAction = true
        defer { isValidatingAction = false }

        do {
            try await ConversationService.validateAction(
                workspaceId: workspaceId,
                conversationId: info.conversationId,
                messageId: info.messageId,
                actionId: info.actionId,
                approved: approved,
                tokenProvider: tokenProvider
            )
            blockedState = nil
        } catch {
            logger.error("Failed to validate action: \(error)")
        }
    }

    // MARK: - Blocked Actions Reconciliation

    /// Sets `blockedState` from the server, for a conversation that's already blocked on load.
    private func reconcileBlockedActions() async {
        do {
            let blocked = try await ConversationService.fetchBlockedActions(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider
            )
            guard let action = blocked.first else { return }

            // Find the message this action belongs to and ensure we're tracking it
            if let messageId = action.messageId, streamingMessageId == nil {
                streamingMessageId = messageId
            }

            switch action.status {
            case .blockedValidationRequired:
                blockedState = .approval(ToolApprovalInfo(from: action, fallbackConversationId: conversation.sId))

            case .blockedAuthenticationRequired:
                let provider = action.metadata?.mcpServerName ?? "Unknown"
                let toolName = action.metadata?.toolName ?? ""
                blockedState = .personalAuth(provider: provider, toolName: toolName)

            case .blockedFileAuthorizationRequired:
                let fileName = action.fileAuthorizationInfo?.fileName ?? "Unknown"
                let toolName = action.fileAuthorizationInfo?.toolName ?? action.metadata?.toolName ?? ""
                blockedState = .fileAuth(fileName: fileName, toolName: toolName)

            case .blockedChildActionInputRequired, .blockedUserAnswerRequired:
                break
            }
        } catch {
            logger.error("Failed to fetch blocked actions: \(error)")
        }
    }

    // MARK: - Retry

    func retryMessage(messageId: String) async {
        lastError = nil
        do {
            try await ConversationService.retryMessage(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                messageId: messageId,
                tokenProvider: tokenProvider
            )
        } catch {
            logger.error("Failed to retry message: \(error)")
        }
    }
}
