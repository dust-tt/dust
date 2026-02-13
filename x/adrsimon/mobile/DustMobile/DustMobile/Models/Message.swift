import Foundation

// MARK: - Message Union (polymorphic message type)

enum MessageUnion: Codable, Equatable, Identifiable {
    case userMessage(UserMessageType)
    case agentMessage(AgentMessagePublicType)
    case contentFragment(ContentFragmentType)

    var id: String { sId }

    var sId: String {
        switch self {
        case .userMessage(let m): return m.sId
        case .agentMessage(let m): return m.sId
        case .contentFragment(let m): return m.sId
        }
    }

    var created: Int {
        switch self {
        case .userMessage(let m): return m.created
        case .agentMessage(let m): return m.created
        case .contentFragment(let m): return m.created
        }
    }

    var type: String {
        switch self {
        case .userMessage: return "user_message"
        case .agentMessage: return "agent_message"
        case .contentFragment: return "content_fragment"
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "user_message":
            self = .userMessage(try UserMessageType(from: decoder))
        case "agent_message":
            self = .agentMessage(try AgentMessagePublicType(from: decoder))
        case "content_fragment":
            self = .contentFragment(try ContentFragmentType(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown message type: \(type)"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .userMessage(let m): try m.encode(to: encoder)
        case .agentMessage(let m): try m.encode(to: encoder)
        case .contentFragment(let m): try m.encode(to: encoder)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type
    }
}

// MARK: - User Message

struct UserMessageContext: Codable, Equatable {
    let username: String
    let timezone: String
    let fullName: String?
    let email: String?
    let profilePictureUrl: String?
    let origin: String?
}

struct MentionType: Codable, Equatable {
    let configurationId: String?
    let type: String?
    let userId: String?

    var isAgentMention: Bool { configurationId != nil }
}

struct UserMessageType: Codable, Identifiable, Equatable {
    let id: Int
    let created: Int
    let type: String // "user_message"
    let sId: String
    let visibility: String
    let version: Int
    let user: UserType?
    let mentions: [MentionType]
    let content: String
    let context: UserMessageContext
}

// MARK: - Agent Message

struct AgentActionType: Codable, Identifiable, Equatable {
    let id: Int
    let sId: String
    let createdAt: Int
    let updatedAt: Int
    let mcpServerId: String?
    let internalMCPServerName: String?
    let toolName: String
    let agentMessageId: Int
    let functionCallName: String
    let functionCallId: String
    let status: String
    let step: Int
    let executionDurationMs: Int?
    let citationsAllocated: Int
    let generatedFiles: [ActionGeneratedFile]
    let displayLabels: DisplayLabels?
}

struct ActionGeneratedFile: Codable, Equatable {
    let fileId: String
    let title: String
    let contentType: String
    let snippet: String?
    let hidden: Bool?
}

struct DisplayLabels: Codable, Equatable {
    let running: String
    let done: String
}

struct AgentMessageError: Codable, Equatable {
    let code: String
    let message: String
}

struct RawContent: Codable, Equatable {
    let step: Int
    let content: String
}

struct AgentMessagePublicType: Codable, Identifiable, Equatable {
    let id: Int
    let agentMessageId: Int
    let created: Int
    let type: String // "agent_message"
    let sId: String
    let visibility: String
    let version: Int
    let parentMessageId: String?
    let parentAgentMessageId: String?
    let configuration: LightAgentConfigurationType
    var status: String // "created", "succeeded", "failed", "cancelled"
    var actions: [AgentActionType]
    var content: String?
    var chainOfThought: String?
    let rawContents: [RawContent]
    var error: AgentMessageError?
}

// MARK: - Content Fragment

struct ContentFragmentContext: Codable, Equatable {
    let username: String?
    let fullName: String?
    let email: String?
    let profilePictureUrl: String?
}

struct ContentFragmentType: Codable, Identifiable, Equatable {
    let type: String // "content_fragment"
    let id: Int
    let sId: String
    let created: Int
    let visibility: String
    let version: Int
    let sourceUrl: String?
    let title: String
    let contentType: String
    let context: ContentFragmentContext
    let contentFragmentId: String
    let contentFragmentVersion: String
    let contentFragmentType: String? // "file" or "content_node"
    let fileId: String?
    let snippet: String?
    let textUrl: String?
    let textBytes: Int?
}

// MARK: - Upload helpers

struct UploadedContentFragment: Equatable {
    let fileId: String
    let title: String
    let url: String?
}

struct ContentFragments {
    var uploaded: [UploadedContentFragment] = []
    var contentNodes: [ContentNodeAttachment] = []

    var isEmpty: Bool { uploaded.isEmpty && contentNodes.isEmpty }
}

struct ContentNodeAttachment: Equatable {
    let title: String
    let internalId: String
    let dataSourceViewSId: String
}
