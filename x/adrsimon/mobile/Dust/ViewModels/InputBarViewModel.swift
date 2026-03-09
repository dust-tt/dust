import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "InputBar")

@MainActor
final class InputBarViewModel: ObservableObject {
    @Published var agents: [LightAgentConfiguration] = []
    @Published var messageText: String = ""
    @Published var isSending = false
    @Published var error: String?

    /// Set to true when user types '@' — triggers the agent picker sheet.
    @Published var showAgentPicker = false

    private let workspaceId: String
    private let tokenProvider: TokenProvider
    private let user: User

    init(workspaceId: String, tokenProvider: TokenProvider, user: User) {
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
        self.user = user
    }

    func loadAgents() async {
        do {
            let fetched = try await AgentService.fetchAgents(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
            agents = fetched.sorted { lhs, rhs in
                if lhs.userFavorite != rhs.userFavorite {
                    return lhs.userFavorite
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        } catch {
            logger.error("Failed to load agents: \(error)")
        }
    }

    /// Called when the text changes. Detects '@' to open the agent picker.
    func handleTextChange(_ text: String) {
        // Check if user just typed '@' (last character)
        if text.hasSuffix("@") {
            let beforeAt = text.dropLast()
            if beforeAt.isEmpty || beforeAt.last == " " {
                showAgentPicker = true
            }
        }
    }

    /// Inserts an @mention for the selected agent into the text.
    func insertMention(_ agent: LightAgentConfiguration) {
        // Remove trailing '@' that triggered the picker (if present)
        var base = messageText
        if base.hasSuffix("@") {
            base = String(base.dropLast())
        }
        let trimmed = base.trimmingCharacters(in: .whitespaces)
        messageText = trimmed.isEmpty ? "@\(agent.name) " : "\(trimmed) @\(agent.name) "
        showAgentPicker = false
    }

    func sendMessage() async -> Conversation? {
        guard let (text, context) = prepareSend() else { return nil }

        let request = CreateConversationRequest(
            message: CreateMessagePayload(
                content: text,
                mentions: resolveMentions(in: text),
                context: context
            )
        )

        return await performSend {
            try await ConversationService.createConversation(
                workspaceId: self.workspaceId,
                request: request,
                tokenProvider: self.tokenProvider
            )
        }
    }

    func sendReply(conversationId: String) async -> Bool {
        guard let (text, context) = prepareSend() else { return false }

        let request = PostMessageRequest(
            content: text,
            mentions: resolveMentions(in: text),
            context: context
        )

        let result: Bool? = await performSend {
            try await ConversationService.postMessage(
                workspaceId: self.workspaceId,
                conversationId: conversationId,
                request: request,
                tokenProvider: self.tokenProvider
            )
            return true
        }
        return result ?? false
    }

    // MARK: - Private

    private var messageContext: MessageContext {
        MessageContext(
            timezone: TimeZone.current.identifier,
            profilePictureUrl: user.profilePictureUrl
        )
    }

    private func prepareSend() -> (text: String, context: MessageContext)? {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        return (text, messageContext)
    }

    /// Resolve mentions by scanning the text for @agentName tokens
    /// and matching them against known agents.
    private func resolveMentions(in text: String) -> [MentionPayload] {
        var result: [MentionPayload] = []
        var seen = Set<String>()

        for agent in agents {
            if text.contains("@\(agent.name)"), !seen.contains(agent.sId) {
                result.append(MentionPayload(configurationId: agent.sId))
                seen.insert(agent.sId)
            }
        }
        return result
    }

    private func performSend<T>(_ operation: () async throws -> T) async -> T? {
        isSending = true
        error = nil

        do {
            let result = try await operation()
            isSending = false
            messageText = ""
            return result
        } catch {
            logger.error("Send failed: \(error)")
            self.error = error.localizedDescription
            isSending = false
            return nil
        }
    }
}
