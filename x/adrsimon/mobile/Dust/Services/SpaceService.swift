import Foundation

enum SpaceService {
    static func fetchPods(
        workspaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> [Space] {
        let endpoint = AppConfig.Endpoints.spacesSummary(workspaceId: workspaceId)
        let response: SpaceSummaryResponse = try await APIClient.authenticatedGet(
            endpoint, tokenProvider: tokenProvider, snakeCase: false
        )
        return response.summary
            .map(\.space)
            .filter { $0.kind == "project" }
    }

    static func searchPods(
        workspaceId: String,
        query: String,
        lastValue: String?,
        limit: Int,
        tokenProvider: TokenProvider
    ) async throws -> SearchPodsResponse {
        let endpoint = AppConfig.Endpoints.searchPods(
            workspaceId: workspaceId,
            query: query,
            lastValue: lastValue,
            limit: limit
        )
        return try await APIClient.authenticatedGet(endpoint, tokenProvider: tokenProvider, snakeCase: false)
    }

    static func joinPod(
        workspaceId: String,
        spaceId: String,
        tokenProvider: TokenProvider
    ) async throws {
        struct EmptyBody: Encodable {}
        try await APIClient.authenticatedSend(
            AppConfig.Endpoints.joinPod(workspaceId: workspaceId, spaceId: spaceId),
            method: "POST",
            body: EmptyBody(),
            tokenProvider: tokenProvider
        )
    }

    static func fetchGlobalSpaces(
        workspaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> [Space] {
        let endpoint = AppConfig.Endpoints.spaces(workspaceId: workspaceId)
        let response: SpacesResponse = try await APIClient.authenticatedGet(
            endpoint, tokenProvider: tokenProvider, snakeCase: false
        )
        return response.spaces.filter { $0.kind == "global" }
    }
}
