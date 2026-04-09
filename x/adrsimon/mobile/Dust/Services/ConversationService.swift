import Foundation

enum ConversationService {
    private static let defaultLimit = 100

    static func fetchConversations(
        workspaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = defaultLimit
    ) async throws -> ConversationsResponse {
        let endpoint = AppConfig.Endpoints.conversations(workspaceId: workspaceId)
        let query = buildQuery(endpoint: endpoint, params: [
            "limit": "\(limit)",
        ])
        return try await APIClient.authenticatedGet(query, tokenProvider: tokenProvider, snakeCase: false)
    }

    static func fetchSpaceConversations(
        workspaceId: String,
        spaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = defaultLimit
    ) async throws -> ConversationsResponse {
        let endpoint = AppConfig.Endpoints.spaceConversations(workspaceId: workspaceId, spaceId: spaceId)
        let query = buildQuery(endpoint: endpoint, params: [
            "limit": "\(limit)",
        ])
        return try await APIClient.authenticatedGet(query, tokenProvider: tokenProvider, snakeCase: false)
    }

    static func fetchMessages(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
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
        return try await APIClient.authenticatedGet(query, tokenProvider: tokenProvider, snakeCase: false)
    }

    static func createConversation(
        workspaceId: String,
        request: CreateConversationRequest,
        tokenProvider: TokenProvider
    ) async throws -> Conversation {
        let endpoint = AppConfig.Endpoints.conversations(workspaceId: workspaceId)
        let response: CreateConversationResponse = try await APIClient.authenticatedPost(
            endpoint,
            body: request,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.conversation
    }

    static func postMessage(
        workspaceId: String,
        conversationId: String,
        request: PostMessageRequest,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversationMessages(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        let _: PostMessageResponse = try await APIClient.authenticatedPost(
            endpoint,
            body: request,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
    }

    static func markAsRead(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversation(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        try await APIClient.authenticatedSend(
            endpoint, method: "PATCH", body: MarkAsReadRequest(read: true), tokenProvider: tokenProvider
        )
    }

    static func bulkMarkAsRead(
        workspaceId: String,
        conversationIds: [String],
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversationsBulkActions(workspaceId: workspaceId)
        try await APIClient.authenticatedSend(
            endpoint,
            method: "POST",
            body: BulkMarkAsReadRequest(action: "mark_as_read", conversationIds: conversationIds),
            tokenProvider: tokenProvider
        )
    }

    static func fetchBlockedActions(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider
    ) async throws -> [BlockedAction] {
        let endpoint = AppConfig.Endpoints.blockedActions(
            workspaceId: workspaceId,
            conversationId: conversationId
        )
        let response: BlockedActionsResponse = try await APIClient.authenticatedGet(
            endpoint, tokenProvider: tokenProvider, snakeCase: false
        )
        return response.blockedActions
    }

    // swiftlint:disable:next function_parameter_count
    static func validateAction(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        actionId: String,
        approved: ActionApproval,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.validateAction(
            workspaceId: workspaceId,
            conversationId: conversationId,
            messageId: messageId
        )
        try await APIClient.authenticatedSend(
            endpoint,
            method: "POST",
            body: ValidateActionRequest(actionId: actionId, approved: approved.rawValue),
            tokenProvider: tokenProvider
        )
    }

    static func retryMessage(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.retryMessage(
            workspaceId: workspaceId,
            conversationId: conversationId,
            messageId: messageId
        )
        try await APIClient.authenticatedSend(
            endpoint,
            method: "POST",
            body: RetryMessageRequest(),
            tokenProvider: tokenProvider
        )
    }

    // MARK: - Request Bodies

    private struct ValidateActionRequest: Encodable {
        let actionId: String
        let approved: String
    }

    private struct RetryMessageRequest: Encodable {}

    private struct MarkAsReadRequest: Encodable {
        let read: Bool
    }

    private struct BulkMarkAsReadRequest: Encodable {
        let action: String
        let conversationIds: [String]
    }

    private static func buildQuery(endpoint: String, params: [String: String]) -> String {
        var components = URLComponents()
        components.path = endpoint
        components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        return components.string ?? endpoint
    }
}
