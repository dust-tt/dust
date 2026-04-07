import Foundation

enum MessageType: String, Codable {
    case userMessage = "user_message"
    case agentMessage = "agent_message"
}

enum AgentMessageStatus: String, Codable {
    case created
    case succeeded
    case failed
    case cancelled
}

struct UserMessage: Codable, Identifiable {
    let id: Int
    let sId: String
    let type: MessageType
    let created: Double
    let visibility: String
    let version: Int
    let rank: Int
    let content: String
    let context: UserMessageContext?
    let contentFragments: [ContentFragment]?

    var createdDate: Date {
        created.dateFromEpochMs
    }
}

struct UserMessageContext: Codable {
    let username: String?
    let fullName: String?
    let email: String?
    let profilePictureUrl: String?
}

// MARK: - Content Fragment (nested in UserMessage)

struct ContentFragment: Codable, Identifiable, Hashable {
    let id: Int
    let sId: String
    let created: Double
    let title: String
    let contentType: String
    let fileId: String?
    let snippet: String?
    let sourceUrl: String?

    var isImage: Bool {
        contentType.hasPrefix("image/")
    }
}

struct AgentConfiguration: Codable {
    let sId: String
    let name: String
    let pictureUrl: String
}

struct AgentMessage: Codable, Identifiable {
    let sId: String
    let type: MessageType
    let created: Double
    let visibility: String
    let version: Int
    let rank: Int
    var status: AgentMessageStatus
    var content: String?
    var chainOfThought: String?
    let configuration: AgentConfiguration

    var id: String {
        sId
    }

    var createdDate: Date {
        created.dateFromEpochMs
    }

    var isStreaming: Bool {
        status == .created
    }
}

// MARK: - Agent streaming state

struct ActiveAction: Equatable, Identifiable {
    let id: Int
    let label: String
    let serverName: String?
}

enum ActionApproval: String {
    case approved
    case rejected
    case alwaysApproved = "always_approved"
}

enum ToolStake: String, Decodable {
    case low, medium, high
    case neverAsk = "never_ask"
}

enum ErrorCategory: String, Decodable {
    case retryableModelError = "retryable_model_error"
    case streamError = "stream_error"
}

struct ToolApprovalInfo: Equatable {
    let actionId: String
    let messageId: String
    let conversationId: String
    let toolName: String?
    let mcpServerName: String?
    let agentName: String?
    let stake: ToolStake?
    let inputs: [String: ToolInputValue]?
    let argumentsRequiringApproval: [String]?

    var canAlwaysAllow: Bool {
        stake == .low || stake == .medium
    }

    /// Pre-computed displayable inputs.
    let displayableInputs: [(key: String, value: String)]

    init(
        actionId: String,
        messageId: String,
        conversationId: String,
        toolName: String?,
        mcpServerName: String?,
        agentName: String?,
        stake: ToolStake?,
        inputs: [String: ToolInputValue]?,
        argumentsRequiringApproval: [String]?
    ) {
        self.actionId = actionId
        self.messageId = messageId
        self.conversationId = conversationId
        self.toolName = toolName
        self.mcpServerName = mcpServerName
        self.agentName = agentName
        self.stake = stake
        self.inputs = inputs
        self.argumentsRequiringApproval = argumentsRequiringApproval

        self.displayableInputs = (inputs ?? [:]).compactMap { key, val in
            guard let display = val.displayValue else { return nil }
            let truncated = display.count > 300
                ? String(display.prefix(300)) + "…"
                : display
            return (key: key.humanized, value: truncated)
        }
        .sorted { $0.key < $1.key }
    }

    static func == (lhs: ToolApprovalInfo, rhs: ToolApprovalInfo) -> Bool {
        lhs.actionId == rhs.actionId
    }

    init(from event: ToolApproveExecutionEvent, fallbackMessageId: String, fallbackConversationId: String) {
        self.init(
            actionId: event.actionId ?? "",
            messageId: event.messageId ?? fallbackMessageId,
            conversationId: event.conversationId ?? fallbackConversationId,
            toolName: event.metadata?.toolName,
            mcpServerName: event.metadata?.mcpServerName,
            agentName: event.metadata?.agentName,
            stake: event.stake.flatMap(ToolStake.init(rawValue:)),
            inputs: event.inputs,
            argumentsRequiringApproval: event.argumentsRequiringApproval
        )
    }

    init(from action: BlockedAction, fallbackConversationId: String) {
        self.init(
            actionId: action.actionId ?? "",
            messageId: action.messageId ?? "",
            conversationId: action.conversationId ?? fallbackConversationId,
            toolName: action.metadata?.toolName,
            mcpServerName: action.metadata?.mcpServerName,
            agentName: action.metadata?.agentName,
            stake: action.stake.flatMap(ToolStake.init(rawValue:)),
            inputs: action.inputs,
            argumentsRequiringApproval: action.argumentsRequiringApproval
        )
    }
}

private extension String {
    var humanized: String {
        let spaced = unicodeScalars.reduce("") { result, scalar in
            if CharacterSet.uppercaseLetters.contains(scalar), !result.isEmpty {
                return result + " " + String(scalar)
            }
            return result + String(scalar)
        }
        return spaced
            .replacing("_", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
            .joined(separator: " ")
    }
}

struct ErrorInfo: Equatable {
    let code: String?
    let message: String
    let category: ErrorCategory?
    let errorTitle: String?
    let messageId: String

    var isRetryable: Bool {
        category == .retryableModelError || category == .streamError
    }

    init(from error: StreamingError, messageId: String) {
        self.code = error.code
        self.message = error.message
        self.category = error.metadata?.category.flatMap(ErrorCategory.init(rawValue:))
        self.errorTitle = error.metadata?.errorTitle
        self.messageId = messageId
    }
}

enum AgentStreamingPhase: Equatable {
    case idle
    case thinking
    case generating
    case personalAuthRequired(provider: String, toolName: String)
    case fileAuthRequired(fileName: String, toolName: String)
    case approvalRequired(approval: ToolApprovalInfo)
}

enum ConversationMessage: Identifiable {
    case user(UserMessage)
    case agent(AgentMessage)

    var id: String {
        switch self {
        case let .user(msg): msg.sId
        case let .agent(msg): msg.sId
        }
    }

    var rank: Int {
        switch self {
        case let .user(msg): msg.rank
        case let .agent(msg): msg.rank
        }
    }

    var created: Double {
        switch self {
        case let .user(msg): msg.created
        case let .agent(msg): msg.created
        }
    }

    static func byRank(_ lhs: ConversationMessage, _ rhs: ConversationMessage) -> Bool {
        if lhs.rank != rhs.rank { return lhs.rank < rhs.rank }
        return lhs.created < rhs.created
    }
}

// MARK: - Decoding from heterogeneous array

extension ConversationMessage: Decodable {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(MessageType.self, forKey: .type)

        switch type {
        case .userMessage:
            let msg = try UserMessage(from: decoder)
            self = .user(msg)
        case .agentMessage:
            let msg = try AgentMessage(from: decoder)
            self = .agent(msg)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }
}

struct ConversationMessagesResponse: Decodable {
    let messages: [ConversationMessage]
    let hasMore: Bool
    let lastValue: Int?
}
