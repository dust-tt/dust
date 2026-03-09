import Foundation

enum AgentService {
    static func fetchAgents(
        workspaceId: String,
        tokenProvider: TokenProvider
    ) async throws -> [LightAgentConfiguration] {
        let endpoint = AppConfig.Endpoints.agentConfigurations(workspaceId: workspaceId)
        let query = "\(endpoint)?view=list"
        let response: AgentConfigurationsResponse = try await APIClient.authenticatedGet(
            query,
            tokenProvider: tokenProvider,
            snakeCase: false
        )
        return response.agentConfigurations
    }
}
