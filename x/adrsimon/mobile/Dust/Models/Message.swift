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

enum AgentStreamingPhase: Equatable {
    /// Not streaming (completed, failed, cancelled, or not started)
    case idle
    /// Agent is thinking (chain of thought being generated)
    case thinking
    /// Agent is executing an action/tool
    case acting(label: String)
    /// Agent is generating response tokens
    case generating
    /// Agent is waiting for the user to authenticate on a third-party service
    case personalAuthRequired(provider: String)
    /// Agent is waiting for the user to grant file access
    case fileAuthRequired(fileName: String)
    /// Agent is waiting for the user to approve a tool execution
    case approvalRequired
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
