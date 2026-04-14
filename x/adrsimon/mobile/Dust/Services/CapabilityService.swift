import Foundation

enum ConversationAction: String, Encodable {
    case add
    case delete
}

enum CapabilityService {
    // MARK: - Listing

    static func fetchMCPServerViews(
        workspaceId: String,
        spaceIds: [String],
        tokenProvider: TokenProvider
    ) async throws -> [MCPServerView] {
        let endpoint = AppConfig.Endpoints.mcpServerViews(workspaceId: workspaceId)
        var components = URLComponents(string: endpoint)!
        components.queryItems = [
            URLQueryItem(name: "spaceIds", value: spaceIds.joined(separator: ",")),
            URLQueryItem(name: "availabilities", value: "manual,auto"),
        ]
        let response: MCPServerViewsResponse = try await APIClient.authenticatedGet(
            components.string!, tokenProvider: tokenProvider, snakeCase: false
        )
        return response.serverViews
    }

    static func fetchSkills(
        workspaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> [Skill] {
        let endpoint = AppConfig.Endpoints.skills(workspaceId: workspaceId)
        var components = URLComponents(string: endpoint)!
        components.queryItems = [
            URLQueryItem(name: "status", value: "active"),
            URLQueryItem(name: "globalSpaceOnly", value: "true"),
        ]
        let response: SkillsResponse = try await APIClient.authenticatedGet(
            components.string!, tokenProvider: tokenProvider, snakeCase: false
        )
        return response.skills
    }

    // MARK: - Search

    static func searchKnowledge(
        workspaceId: String,
        query: String,
        tokenProvider: TokenProvider
    ) async throws -> SearchResponse {
        let endpoint = AppConfig.Endpoints.search(workspaceId: workspaceId)
        let body = SearchRequest(query: query)
        return try await APIClient.authenticatedPost(
            endpoint, body: body, tokenProvider: tokenProvider, snakeCase: false
        )
    }

    // MARK: - Conversation Capabilities

    static func updateTool(
        action: ConversationAction,
        workspaceId: String,
        conversationId: String,
        mcpServerViewId: String,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversationTools(
            workspaceId: workspaceId, conversationId: conversationId
        )
        let body = ConversationToolActionRequest(action: action, mcpServerViewId: mcpServerViewId)
        try await APIClient.authenticatedSend(endpoint, method: "POST", body: body, tokenProvider: tokenProvider, snakeCase: true)
    }

    static func updateSkill(
        action: ConversationAction,
        workspaceId: String,
        conversationId: String,
        skillId: String,
        tokenProvider: TokenProvider
    ) async throws {
        let endpoint = AppConfig.Endpoints.conversationSkills(
            workspaceId: workspaceId, conversationId: conversationId
        )
        let body = ConversationSkillActionRequest(action: action, skillId: skillId)
        try await APIClient.authenticatedSend(endpoint, method: "POST", body: body, tokenProvider: tokenProvider)
    }
}

// MARK: - Request Bodies

private struct ConversationToolActionRequest: Encodable {
    let action: ConversationAction
    let mcpServerViewId: String
}

private struct ConversationSkillActionRequest: Encodable {
    let action: ConversationAction
    let skillId: String
}
