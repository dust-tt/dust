import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "ConversationDetail")

@MainActor
final class ConversationDetailViewModel: ObservableObject {
    enum State {
        case loading
        case loaded
        case error(String)
    }

    @Published var state: State = .loading
    @Published var messages: [ConversationMessage] = []
    @Published var hasMore = false

    /// Streaming phase for the currently streaming agent message (if any).
    @Published var streamingPhase: AgentStreamingPhase = .idle
    /// Currently running actions (tools executing in parallel).
    @Published var activeActions: [ActiveAction] = []
    /// sId of the message currently being streamed.
    @Published var streamingMessageId: String?

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

            // Start streaming for any in-progress agent message
            startStreamingIfNeeded()

            // Start listening for conversation-level events (new messages, title changes)
            startConversationEvents()

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
        conversationEventsTask = Task { [weak self] in
            guard let self else { return }
            var retryDelay: UInt64 = 1_000_000_000 // 1s
            let maxDelay: UInt64 = 30_000_000_000 // 30s

            while !Task.isCancelled {
                let endpoint = AppConfig.Endpoints.conversationEvents(
                    workspaceId: workspaceId,
                    conversationId: conversation.sId
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
                            await handleConversationEvent(envelope.data)
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

                try? await Task.sleep(nanoseconds: retryDelay)
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
            insertMessageIfNew(.user(newEvent.message))

        case .agentMessageDone, .conversationTitle, .unknown:
            break
        }
    }

    private func insertMessageIfNew(_ msg: ConversationMessage) {
        guard !messages.contains(where: { $0.id == msg.id }) else { return }
        messages.append(msg)
        messages.sort(by: ConversationMessage.byRank)
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
        // Don't restart if already streaming this message
        if streamingMessageId == messageId { return }

        messageStreamTask?.cancel()
        streamGeneration += 1
        let currentGeneration = streamGeneration
        streamingMessageId = messageId
        streamingPhase = .thinking

        messageStreamTask = Task { [weak self] in
            guard let self else { return }
            let endpoint = AppConfig.Endpoints.messageEvents(
                workspaceId: workspaceId,
                conversationId: conversation.sId,
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
                        await handleMessageEvent(envelope.data, messageId: messageId)
                    } catch {
                        logger.debug("Skipping unhandled message event: \(error)")
                    }
                }
            } catch {
                if !Task.isCancelled {
                    logger.error("Message stream error for \(messageId): \(error)")
                }
            }

            // Stream ended — only clean up if we're still the active generation
            if streamGeneration == currentGeneration {
                streamingPhase = .idle
                streamingMessageId = nil
            }
        }
    }

    private func handleMessageEvent(_ event: StreamingEventData, messageId: String) async {
        switch event {
        case let .generationTokens(tokens):
            handleGenerationTokens(tokens, messageId: messageId)

        case let .toolParams(params):
            let action = ActiveAction(
                id: params.action.id,
                label: params.action.displayLabels?.running ?? params.action.toolName ?? "Working…",
                serverName: params.action.internalMCPServerName
            )
            if !activeActions.contains(where: { $0.id == action.id }) {
                activeActions.append(action)
            }

        case let .agentActionSuccess(event):
            activeActions.removeAll { $0.id == event.action.id }
            if activeActions.isEmpty, streamingPhase != .generating {
                streamingPhase = .thinking
            }

        case let .agentMessageSuccess(success):
            finalizeMessage(messageId: messageId, status: .succeeded, from: success.message)

        case .agentError, .toolError:
            finalizeMessage(messageId: messageId, status: .failed)

        case .agentGenerationCancelled:
            finalizeMessage(messageId: messageId, status: .cancelled)

        case let .toolPersonalAuthRequired(event):
            streamingPhase = .personalAuthRequired(provider: event.authError.provider)

        case let .toolFileAuthRequired(event):
            streamingPhase = .fileAuthRequired(fileName: event.fileAuthError.fileName)

        case .toolApproveExecution:
            streamingPhase = .approvalRequired

        case .toolNotification, .agentContextPruned, .endOfStream, .unknown:
            break
        }
    }

    private func handleGenerationTokens(_ tokens: GenerationTokensEvent, messageId: String) {
        updateAgentMessage(id: messageId) { msg in
            switch tokens.classification {
            case .tokens:
                msg.content = (msg.content ?? "") + tokens.text
            case .chainOfThought:
                msg.chainOfThought = (msg.chainOfThought ?? "") + tokens.text
            case .openingDelimiter, .closingDelimiter:
                break
            }
        }
        switch tokens.classification {
        case .chainOfThought:
            streamingPhase = .thinking
        case .tokens:
            streamingPhase = .generating
        case .openingDelimiter, .closingDelimiter:
            break
        }
    }

    private func finalizeMessage(messageId: String, status: AgentMessageStatus, from final: AgentMessage? = nil) {
        updateAgentMessage(id: messageId) { msg in
            if let final {
                msg.content = final.content
                msg.chainOfThought = final.chainOfThought
            }
            msg.status = status
        }
        streamingPhase = .idle
        activeActions = []
        streamingMessageId = nil
    }

    /// Mutate the agent message with the given sId in-place and trigger a publish.
    private func updateAgentMessage(id: String, mutate: (inout AgentMessage) -> Void) {
        guard let index = messages.firstIndex(where: { $0.id == id }),
              case var .agent(agentMsg) = messages[index]
        else { return }

        mutate(&agentMsg)
        messages[index] = .agent(agentMsg)
    }
}
