import Foundation

enum APIEndpoints {
    // Auth
    static func authorize() -> String {
        "/api/v1/auth/authorize"
    }

    static func authenticate() -> String {
        "/api/v1/auth/authenticate"
    }

    static func me() -> String {
        "/api/v1/me"
    }

    // Conversations
    static func conversations(workspaceId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations"
    }

    static func conversation(workspaceId: String, conversationId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)"
    }

    // Messages
    static func messages(workspaceId: String, conversationId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages"
    }

    static func retryMessage(workspaceId: String, conversationId: String, messageId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/retry"
    }

    // Message feedback
    static func messageFeedback(workspaceId: String, conversationId: String, messageId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/feedbacks"
    }

    // Agents
    static func agentConfigurations(workspaceId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/agent_configurations"
    }

    // SSE Streams
    static func conversationEvents(workspaceId: String, conversationId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/events"
    }

    static func messageEvents(workspaceId: String, conversationId: String, messageId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/messages/\(messageId)/events"
    }

    // Content fragments
    static func contentFragments(workspaceId: String, conversationId: String) -> String {
        "/api/v1/w/\(workspaceId)/assistant/conversations/\(conversationId)/content_fragments"
    }

    // Files
    static func files(workspaceId: String) -> String {
        "/api/v1/w/\(workspaceId)/files"
    }

    static func fileUpload(workspaceId: String, fileId: String) -> String {
        "/api/v1/w/\(workspaceId)/files/\(fileId)"
    }

    // Spaces
    static func spaces(workspaceId: String) -> String {
        "/api/v1/w/\(workspaceId)/spaces"
    }

    static func dataSourceViews(workspaceId: String, spaceId: String) -> String {
        "/api/v1/w/\(workspaceId)/spaces/\(spaceId)/data_source_views"
    }

    static func contentNodes(workspaceId: String, spaceId: String, dataSourceViewId: String) -> String {
        "/api/v1/w/\(workspaceId)/spaces/\(spaceId)/data_source_views/\(dataSourceViewId)/content-nodes"
    }
}
