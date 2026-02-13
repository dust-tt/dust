import Foundation

// MARK: - Token Classification

enum TokenClassification: String, Codable {
    case tokens
    case chainOfThought = "chain_of_thought"
    case openingDelimiter = "opening_delimiter"
    case closingDelimiter = "closing_delimiter"
}

// MARK: - Conversation-level SSE events

enum ConversationStreamEvent {
    case userMessageNew(UserMessageNewEvent)
    case agentMessageNew(AgentMessageNewEvent)
    case agentGenerationCancelled(AgentGenerationCancelledEvent)
    case conversationTitle(ConversationTitleEvent)
    case done
    case unknown(String)
}

struct UserMessageNewEvent: Codable {
    let type: String // "user_message_new"
    let created: Int
    let messageId: String
    let message: UserMessageType
}

struct AgentMessageNewEvent: Codable {
    let type: String // "agent_message_new"
    let created: Int
    let configurationId: String
    let messageId: String
    let message: AgentMessagePublicType
}

struct AgentGenerationCancelledEvent: Codable {
    let type: String // "agent_generation_cancelled"
    let created: Int
    let configurationId: String
    let messageId: String
}

struct ConversationTitleEvent: Codable {
    let type: String // "conversation_title"
    let created: Int
    let title: String
}

// MARK: - Per-message SSE events

enum AgentMessageStreamEvent {
    case generationTokens(GenerationTokensEvent)
    case agentActionSuccess(AgentActionSuccessEvent)
    case agentMessageSuccess(AgentMessageSuccessEvent)
    case agentError(AgentErrorEvent)
    case agentGenerationCancelled(AgentGenerationCancelledEvent)
    case toolParams(ToolParamsEvent)
    case toolNotification(ToolNotificationEvent)
    case toolError(ToolErrorEvent)
    case done
    case unknown(String)
}

struct GenerationTokensEvent: Codable {
    let type: String // "generation_tokens"
    let created: Int
    let configurationId: String
    let messageId: String
    let text: String
    let classification: String
}

struct AgentActionSuccessEvent: Codable {
    let type: String // "agent_action_success"
    let created: Int
    let configurationId: String
    let messageId: String
    let action: AgentActionType
}

struct AgentMessageSuccessEvent: Codable {
    let type: String // "agent_message_success"
    let created: Int
    let configurationId: String
    let messageId: String
    let message: AgentMessagePublicType
}

struct AgentErrorEvent: Codable {
    let type: String // "agent_error"
    let created: Int
    let configurationId: String
    let messageId: String
    let error: AgentMessageError
}

struct ToolParamsEvent: Codable {
    let type: String // "tool_params"
    let created: Int
    let configurationId: String
    let messageId: String
    let action: AgentActionType
}

struct ToolNotificationEvent: Codable {
    let type: String // "tool_notification"
    let created: Int
    let configurationId: String
    let messageId: String
    let action: AgentActionType
}

struct ToolErrorEvent: Codable {
    let type: String // "tool_error"
    let created: Int
    let configurationId: String
    let messageId: String
    let error: AgentMessageError
}

// MARK: - Agent State Classification

enum AgentStateClassification: String {
    case thinking
    case acting
    case writing
    case done
}
