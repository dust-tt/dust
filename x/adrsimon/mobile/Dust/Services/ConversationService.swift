import Foundation

enum ConversationService {
    private static let defaultLimit = 100

    static func fetchConversations(
        workspaceId: String,
        accessToken: String,
        limit: Int = defaultLimit
    ) async throws -> ConversationsResponse {
        let endpoint = AppConfig.Endpoints.conversations(workspaceId: workspaceId)
        return try await APIClient.getCamelCase(
            "\(endpoint)?limit=\(limit)",
            accessToken: accessToken
        )
    }

    static func fetchMessages(
        workspaceId: String,
        conversationId: String,
        accessToken: String,
        limit: Int = 50,
        lastValue: Int? = nil
    ) async throws -> ConversationMessagesResponse {
        let endpoint = AppConfig.Endpoints.conversationMessages(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        var query = "\(endpoint)?newResponseFormat=1&orderDirection=desc&orderColumn=rank&limit=\(limit)"
        if let lastValue {
            query += "&lastValue=\(lastValue)"
        }
        return try await APIClient.getCamelCase(query, accessToken: accessToken)
    }
}
