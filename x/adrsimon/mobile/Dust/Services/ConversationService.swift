import Foundation

enum ConversationService {
    private static let defaultLimit = 100

    static func fetchConversations(
        workspaceId: String,
        accessToken: String,
        limit: Int = defaultLimit
    ) async throws -> ConversationsResponse {
        let endpoint = AppConfig.Endpoints.conversations(workspaceId: workspaceId)
        let query = buildQuery(endpoint: endpoint, params: [
            "limit": "\(limit)",
        ])
        return try await APIClient.get(query, accessToken: accessToken, snakeCase: false)
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
        var params: [String: String] = [
            "newResponseFormat": "1",
            "orderDirection": "desc",
            "orderColumn": "rank",
            "limit": "\(limit)",
        ]
        if let lastValue {
            params["lastValue"] = "\(lastValue)"
        }
        let query = buildQuery(endpoint: endpoint, params: params)
        return try await APIClient.get(query, accessToken: accessToken, snakeCase: false)
    }

    private static func buildQuery(endpoint: String, params: [String: String]) -> String {
        var components = URLComponents(string: "\(AppConfig.apiBaseURL)\(endpoint)")
        components?.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        // Strip the base URL prefix since APIClient prepends it
        return components?.url?.absoluteString.replacingOccurrences(of: AppConfig.apiBaseURL, with: "") ?? endpoint
    }
}
