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
}
