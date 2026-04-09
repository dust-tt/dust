import Foundation

enum SpaceService {
    static func fetchProjects(
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
}
