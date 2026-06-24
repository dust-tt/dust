import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "ConversationDetail")

private enum StreamingReconnect {
    static let nanosecondsPerSecond: UInt64 = 1_000_000_000
    static let initialRetryDelayNs: UInt64 = 1_000_000_000 // 1s
    static let maxRetryDelayNs: UInt64 = 30_000_000_000 // 30s
    static let cleanReconnectDelayNs: UInt64 = 250_000_000 // 250ms
}

private struct StreamEventCursor {
    private(set) var lastEventId: String?
    private var seenEventIds = Set<String>()

    mutating func shouldProcess(eventId: String) -> Bool {
        guard !eventId.isEmpty else { return true }
        guard !seenEventIds.contains(eventId) else { return false }
        seenEventIds.insert(eventId)
        lastEventId = eventId
        return true
    }
}

private func nextReconnectDelayNs(shouldBackOff: Bool, retryDelayNs: inout UInt64) -> UInt64 {
    if shouldBackOff {
        let delayNs = retryDelayNs
        retryDelayNs = min(retryDelayNs * 2, StreamingReconnect.maxRetryDelayNs)
        return delayNs
    }

    retryDelayNs = StreamingReconnect.initialRetryDelayNs
    return StreamingReconnect.cleanReconnectDelayNs
}

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
    @Published var conversationTitle: String?

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
    /// Set when a validate/answer request fails, surfaced as an alert.
    @Published var actionError: String?

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

    /// The agent used in the conversation's latest agent message, so the input bar can target it.
    var currentAgentId: String? {
        for message in messages.reversed() {
            if case let .agent(agentMsg) = message { return agentMsg.configuration.sId }
        }
        return nil
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
        self.conversationTitle = conversation.title
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
            var retryDelayNs = StreamingReconnect.initialRetryDelayNs
            var cursor = StreamEventCursor()

            while !Task.isCancelled {
                let endpoint = AppConfig.Endpoints.conversationEvents(
                    workspaceId: workspaceId,
                    conversationId: conversationId
                )

                let stream = StreamingService.eventStream(
                    endpoint: endpoint,
                    tokenProvider: tokenProvider,
                    lastEventId: cursor.lastEventId
                )

                let decoder = JSONDecoder()
                var shouldBackOff = false

                do {
                    for try await payload in stream {
                        guard !Task.isCancelled else { return }
                        guard let data = payload.data(using: .utf8) else { continue }

                        do {
                            let envelope = try decoder.decode(ConversationEventEnvelope.self, from: data)
                            guard cursor.shouldProcess(eventId: envelope.eventId) else { continue }
                            retryDelayNs = StreamingReconnect.initialRetryDelayNs
                            await self?.handleConversationEvent(envelope.data)
                        } catch {
                            logger.error("Skipping malformed conversation event: \(error)")
                        }
                    }
                } catch {
                    if Task.isCancelled { return }
                    shouldBackOff = true
                    logger.error(
                        "Conversation events stream error: \(error), retrying in \(retryDelayNs / StreamingReconnect.nanosecondsPerSecond)s"
                    )
                }

                let delayNs = nextReconnectDelayNs(shouldBackOff: shouldBackOff, retryDelayNs: &retryDelayNs)
                try? await Task.sleep(for: .nanoseconds(delayNs))
            }
        }
    }

    private func handleConversationEvent(_ event: ConversationEventData) async {
        switch event {
        case let .agentMessageNew(newEvent):
            let inserted = insertMessageIfNew(.agent(newEvent.message))
            if inserted || isAgentMessageStreaming(id: newEvent.message.sId) {
                startMessageStream(for: newEvent.message.sId)
            }

        case let .userMessageNew(newEvent):
            removeOptimisticUserMessage()
            insertMessageIfNew(.user(newEvent.message))

        case let .userMessagePromoted(event):
            updateUserMessage(id: event.messageId) { msg in
                msg.visibility = "visible"
            }

        case let .agentMessageDone(event):
            await handleAgentMessageDone(event)

        case let .conversationTitle(event):
            handleConversationTitle(event.title)

        case .unknown:
            break
        }
    }

    @discardableResult
    private func insertMessageIfNew(_ msg: ConversationMessage) -> Bool {
        guard !messages.contains(where: { $0.id == msg.id }) else { return false }
        messages.append(msg)
        messages.sort(by: ConversationMessage.byRank)
        return true
    }

    private func isAgentMessageStreaming(id: String) -> Bool {
        messages.contains {
            guard case let .agent(msg) = $0 else { return false }
            return msg.sId == id && msg.isStreaming
        }
    }

    private func handleConversationTitle(_ title: String) {
        conversationTitle = title
        NotificationCenter.default.post(
            name: .conversationTitleDidChange,
            object: nil,
            userInfo: [
                ConversationTitleNotification.conversationIdKey: conversation.sId,
                ConversationTitleNotification.titleKey: title,
            ]
        )
    }

    private func handleAgentMessageDone(_ event: AgentMessageDoneEventData) async {
        guard shouldHandleAgentMessageDone(event) else { return }

        let fallbackStatus = fallbackAgentMessageStatus(fromDoneStatus: event.status)
        let activeSnapshot = turn?.snapshot.messageId == event.messageId ? turn?.snapshot : nil
        cancelMessageStreamIfCurrent(messageId: event.messageId)

        if let activeSnapshot {
            commitTurn(activeSnapshot, status: fallbackStatus, clearTurn: true)
        } else if let fallbackStatus {
            updateAgentMessage(id: event.messageId) { msg in
                msg.status = fallbackStatus
            }
        }

        do {
            let message = try await ConversationService.fetchMessage(
                workspaceId: workspaceId,
                conversationId: event.conversationId,
                messageId: event.messageId,
                tokenProvider: tokenProvider
            )
            upsertMessage(message)
        } catch {
            logger.error("Failed to fetch completed agent message \(event.messageId): \(error)")
        }
    }

    private func shouldHandleAgentMessageDone(_ event: AgentMessageDoneEventData) -> Bool {
        if streamingMessageId == event.messageId { return true }
        if turn?.snapshot.messageId == event.messageId { return true }
        return isAgentMessageStreaming(id: event.messageId)
    }

    private func fallbackAgentMessageStatus(fromDoneStatus status: String) -> AgentMessageStatus? {
        status == "error" ? .failed : nil
    }

    private func cancelMessageStreamIfCurrent(messageId: String) {
        guard streamingMessageId == messageId else { return }
        streamGeneration += 1
        messageStreamTask?.cancel()
        messageStreamTask = nil
        streamingMessageId = nil
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

    // swiftlint:disable:next cyclomatic_complexity
    private func startMessageStream(for messageId: String) {
        if streamingMessageId == messageId, messageStreamTask != nil { return }

        messageStreamTask?.cancel()
        streamGeneration += 1
        let currentGeneration = streamGeneration
        streamingMessageId = messageId
        turn = AgentMessageStream(messageId: messageId)
        blockedState = nil
        lastError = nil

        messageStreamTask = Task { [weak self, workspaceId, conversationId = conversation.sId, tokenProvider] in
            let decoder = JSONDecoder()
            var retryDelayNs = StreamingReconnect.initialRetryDelayNs
            var cursor = StreamEventCursor()
            var isTerminated = false

            while !Task.isCancelled, !isTerminated {
                let endpoint = AppConfig.Endpoints.messageEvents(
                    workspaceId: workspaceId,
                    conversationId: conversationId,
                    messageId: messageId
                )

                let stream = StreamingService.eventStream(
                    endpoint: endpoint,
                    tokenProvider: tokenProvider,
                    lastEventId: cursor.lastEventId
                )

                var didProcessEvent = false
                var shouldBackOff = false

                do {
                    for try await payload in stream {
                        guard !Task.isCancelled else { break }
                        guard let data = payload.data(using: .utf8) else { continue }

                        do {
                            let envelope = try decoder.decode(SSEEnvelope.self, from: data)
                            guard cursor.shouldProcess(eventId: envelope.eventId) else { continue }
                            retryDelayNs = StreamingReconnect.initialRetryDelayNs

                            let finished = await self?.reduce(envelope.data, messageId: messageId) ?? false
                            didProcessEvent = true
                            if finished {
                                isTerminated = true
                                break
                            }
                        } catch {
                            logger.error("Skipping malformed message event for \(messageId): \(error)")
                        }
                    }
                } catch {
                    if Task.isCancelled { break }
                    shouldBackOff = true
                    logger.error("Message stream error for \(messageId): \(error)")
                }

                guard !Task.isCancelled, !isTerminated else { break }

                await self?.commitPartialTurn(messageId: messageId, generation: currentGeneration)

                if !shouldBackOff, !didProcessEvent {
                    let terminal = await self?.refreshMessageIfTerminal(
                        messageId: messageId,
                        conversationId: conversationId,
                        generation: currentGeneration
                    ) ?? true
                    if terminal {
                        isTerminated = true
                        break
                    }
                    shouldBackOff = true
                }

                let delayNs = nextReconnectDelayNs(shouldBackOff: shouldBackOff, retryDelayNs: &retryDelayNs)
                try? await Task.sleep(for: .nanoseconds(delayNs))
            }

            guard let self else { return }
            if streamGeneration == currentGeneration, isTerminated {
                // Terminal events clear the turn through the reducer; this only drops the task reference
                // for the generation that actually finished.
                messageStreamTask = nil
            }
        }
    }

    /// Returns true when the current stream loop should stop.
    /// Stale generations stop immediately; fetch errors return false so the caller retries with backoff.
    private func refreshMessageIfTerminal(messageId: String, conversationId: String, generation: UInt64) async -> Bool {
        guard streamGeneration == generation else { return true }

        do {
            let message = try await ConversationService.fetchMessage(
                workspaceId: workspaceId,
                conversationId: conversationId,
                messageId: messageId,
                tokenProvider: tokenProvider
            )
            upsertMessage(message)

            guard case let .agent(agentMsg) = message else { return false }
            guard !agentMsg.isStreaming else { return false }

            if streamingMessageId == messageId {
                blockedState = nil
                turn = nil
                streamingMessageId = nil
                messageStreamTask = nil
            }
            return true
        } catch {
            logger.error("Failed to refresh idle stream message \(messageId): \(error)")
            return false
        }
    }

    /// Blocking events seed `blockedState`; everything else drives the reducer.
    @discardableResult
    private func reduce(_ event: StreamingEventData, messageId: String) -> Bool {
        switch event {
        case let .toolApproveExecution(event):
            blockedState = .approval(ToolApprovalInfo(
                from: event,
                fallbackMessageId: messageId,
                fallbackConversationId: conversation.sId
            ))
            return false

        case let .toolPersonalAuthRequired(event):
            blockedState = .personalAuth(
                provider: event.authError.provider,
                toolName: event.authError.toolName
            )
            return false

        case let .toolFileAuthRequired(event):
            blockedState = .fileAuth(
                fileName: event.fileAuthError.fileName,
                toolName: event.fileAuthError.toolName
            )
            return false

        case let .toolAskUserQuestion(event):
            blockedState = .userQuestion(UserQuestionInfo(
                from: event,
                fallbackMessageId: messageId,
                fallbackConversationId: conversation.sId
            ))
            return false

        default:
            turn?.apply(event)
            if let snapshot = turn?.snapshot, snapshot.isFinished {
                commitTurn(snapshot, clearTurn: true)
                return true
            }
            return false
        }
    }

    private func commitPartialTurn(messageId: String, generation: UInt64) {
        guard streamGeneration == generation,
              let snapshot = turn?.snapshot,
              snapshot.messageId == messageId
        else { return }

        commitTurn(snapshot, clearTurn: false)
    }

    private func commitTurn(
        _ snapshot: AgentMessageStream.Snapshot,
        status fallbackStatus: AgentMessageStatus? = nil,
        clearTurn: Bool
    ) {
        updateAgentMessage(id: snapshot.messageId) { msg in
            if !snapshot.content.isEmpty {
                msg.content = snapshot.content
            }
            if clearTurn || snapshot.chainOfThought != nil {
                msg.chainOfThought = snapshot.chainOfThought
            }
            if let files = snapshot.generatedFiles { msg.generatedFiles = files }
            if let citations = snapshot.citations { msg.citations = citations }
            if let status = snapshot.status ?? fallbackStatus { msg.status = status }
        }
        if clearTurn {
            lastError = snapshot.error
            blockedState = nil
            turn = nil
            streamingMessageId = nil
            messageStreamTask = nil
        }
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

    private func upsertMessage(_ msg: ConversationMessage) {
        guard let index = messages.firstIndex(where: { $0.id == msg.id }) else {
            insertMessageIfNew(msg)
            return
        }
        messages[index] = msg
        messages.sort(by: ConversationMessage.byRank)
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
            startMessageStream(for: info.messageId)
        } catch {
            logger.error("Failed to validate action: \(error)")
            actionError = error.localizedDescription
        }
    }

    func answerQuestion(_ answer: UserQuestionAnswer) async {
        guard case let .userQuestion(info) = blockedState else { return }
        isValidatingAction = true
        defer { isValidatingAction = false }

        do {
            try await ConversationService.answerQuestion(
                workspaceId: workspaceId,
                conversationId: info.conversationId,
                messageId: info.messageId,
                actionId: info.actionId,
                answer: answer,
                tokenProvider: tokenProvider
            )
            blockedState = nil
            startMessageStream(for: info.messageId)
        } catch {
            logger.error("Failed to answer question: \(error)")
            actionError = error.localizedDescription
        }
    }

    // MARK: - Blocked Actions Reconciliation

    /// Authoritative both ways: sets the block when the server reports one, clears it when not —
    /// the latter unsticks a block resolved out-of-app (web auth), since the stream is then dead.
    private func reconcileBlockedActions() async {
        do {
            let blocked = try await ConversationService.fetchBlockedActions(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
                tokenProvider: tokenProvider
            )
            guard let action = blocked.first else {
                // Resolved elsewhere — release the stream id so the stream can re-attach.
                if blockedState != nil {
                    blockedState = nil
                    streamingMessageId = nil
                    turn = nil
                }
                return
            }

            // Find the message this action belongs to and ensure we're tracking it.
            if let messageId = action.messageId, streamingMessageId == nil {
                startMessageStream(for: messageId)
            }

            if let mapped = mapBlockedState(from: action) {
                blockedState = mapped
            }
        } catch {
            logger.error("Failed to fetch blocked actions: \(error)")
        }
    }

    private func mapBlockedState(from action: BlockedAction) -> BlockedState? {
        switch action.status {
        case .blockedValidationRequired:
            return .approval(ToolApprovalInfo(from: action, fallbackConversationId: conversation.sId))

        case .blockedAuthenticationRequired:
            return .personalAuth(
                provider: action.metadata?.mcpServerName ?? "Unknown",
                toolName: action.metadata?.toolName ?? ""
            )

        case .blockedFileAuthorizationRequired:
            return .fileAuth(
                fileName: action.fileAuthorizationInfo?.fileName ?? "Unknown",
                toolName: action.fileAuthorizationInfo?.toolName ?? action.metadata?.toolName ?? ""
            )

        case .blockedUserAnswerRequired:
            guard let question = action.question else { return nil }
            return .userQuestion(UserQuestionInfo(
                from: action,
                question: question,
                fallbackConversationId: conversation.sId
            ))

        case .blockedChildActionInputRequired:
            return nil
        }
    }

    /// Foreground is the only signal that a block was resolved out-of-app; reload if it cleared.
    func resyncOnForeground() async {
        guard blockedState != nil else { return }
        await reconcileBlockedActions()
        if blockedState == nil {
            await loadMessages()
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
