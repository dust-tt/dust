import Foundation

// MARK: - SSE Envelope

/// Every SSE `data:` line from the server is JSON with this shape.
struct SSEEnvelope: Decodable {
    let eventId: String
    let data: StreamingEventData
}

// MARK: - Conversation-level events

struct ConversationEventEnvelope: Decodable {
    let eventId: String
    let data: ConversationEventData
}

enum ConversationEventData: Decodable {
    case agentMessageNew(AgentMessageNewEvent)
    case agentMessageDone(AgentMessageDoneEventData)
    case userMessageNew(UserMessageNewEvent)
    case conversationTitle(ConversationTitleEvent)
    case unknown(String)

    private enum CodingKeys: String, CodingKey {
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "agent_message_new":
            self = try .agentMessageNew(AgentMessageNewEvent(from: decoder))
        case "agent_message_done":
            self = try .agentMessageDone(AgentMessageDoneEventData(from: decoder))
        case "user_message_new":
            self = try .userMessageNew(UserMessageNewEvent(from: decoder))
        case "conversation_title":
            self = try .conversationTitle(ConversationTitleEvent(from: decoder))
        default:
            self = .unknown(type)
        }
    }
}

struct AgentMessageNewEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let message: AgentMessage
}

struct AgentMessageDoneEventData: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let status: String
}

struct UserMessageNewEvent: Decodable {
    let created: Double
    let messageId: String
    let message: UserMessage
}

struct ConversationTitleEvent: Decodable {
    let created: Double
    let title: String
}

// MARK: - Message-level events (agent message streaming)

enum StreamingEventData: Decodable {
    case generationTokens(GenerationTokensEvent)
    case agentActionSuccess(AgentActionSuccessEvent)
    case toolParams(ToolParamsEvent)
    case toolNotification(ToolNotificationEvent)
    case agentMessageSuccess(AgentMessageSuccessEvent)
    case agentError(AgentErrorEvent)
    case toolError(ToolErrorEvent)
    case agentGenerationCancelled(AgentGenerationCancelledEvent)
    case toolPersonalAuthRequired(ToolPersonalAuthRequiredEvent)
    case toolFileAuthRequired(ToolFileAuthRequiredEvent)
    case toolApproveExecution(ToolApproveExecutionEvent)
    case agentContextPruned
    case endOfStream
    case unknown(String)

    private enum CodingKeys: String, CodingKey {
        case type
    }

    // swiftlint:disable:next cyclomatic_complexity
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "generation_tokens":
            self = try .generationTokens(GenerationTokensEvent(from: decoder))
        case "agent_action_success":
            self = try .agentActionSuccess(AgentActionSuccessEvent(from: decoder))
        case "tool_params":
            self = try .toolParams(ToolParamsEvent(from: decoder))
        case "tool_notification":
            self = try .toolNotification(ToolNotificationEvent(from: decoder))
        case "agent_message_success":
            self = try .agentMessageSuccess(AgentMessageSuccessEvent(from: decoder))
        case "agent_error":
            self = try .agentError(AgentErrorEvent(from: decoder))
        case "tool_error":
            self = try .toolError(ToolErrorEvent(from: decoder))
        case "agent_generation_cancelled":
            self = try .agentGenerationCancelled(AgentGenerationCancelledEvent(from: decoder))
        case "tool_personal_auth_required":
            self = try .toolPersonalAuthRequired(ToolPersonalAuthRequiredEvent(from: decoder))
        case "tool_file_auth_required":
            self = try .toolFileAuthRequired(ToolFileAuthRequiredEvent(from: decoder))
        case "tool_approve_execution":
            self = try .toolApproveExecution(ToolApproveExecutionEvent(from: decoder))
        case "agent_context_pruned":
            self = .agentContextPruned
        case "end-of-stream":
            self = .endOfStream
        default:
            self = .unknown(type)
        }
    }
}

enum TokenClassification: String, Decodable {
    case tokens
    case chainOfThought = "chain_of_thought"
    case openingDelimiter = "opening_delimiter"
    case closingDelimiter = "closing_delimiter"
}

struct GenerationTokensEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let text: String
    let classification: TokenClassification
}

struct AgentActionSuccessEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let action: ActionSummary
}

struct ActionSummary: Decodable {
    let id: Int
    let toolName: String?
    let internalMCPServerName: String?
    let functionCallName: String?
    let displayLabels: ActionDisplayLabels?
}

struct ActionDisplayLabels: Decodable {
    let running: String
    let done: String
}

struct ToolParamsEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let action: ActionSummary
}

struct AgentMessageSuccessEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let message: AgentMessage
}

struct AgentErrorEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
    let error: StreamingError
}

struct ToolErrorEvent: Decodable {
    let created: Double
    let error: StreamingError
}

struct AgentGenerationCancelledEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
}

struct ToolNotificationEvent: Decodable {
    let created: Double
    let configurationId: String
    let messageId: String
}

struct ToolPersonalAuthRequiredEvent: Decodable {
    let authError: ToolPersonalAuthError
}

struct ToolPersonalAuthError: Decodable {
    let provider: String
    let toolName: String
    let message: String
}

struct ToolFileAuthRequiredEvent: Decodable {
    let fileAuthError: ToolFileAuthError
}

struct ToolFileAuthError: Decodable {
    let fileName: String
    let toolName: String
    let message: String
}

struct ToolApproveExecutionEvent: Decodable {}

struct StreamingError: Decodable {
    let code: String?
    let message: String
}
