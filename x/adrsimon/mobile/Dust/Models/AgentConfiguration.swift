import Foundation

struct LightAgentConfiguration: Codable, Identifiable {
    let sId: String
    let name: String
    let description: String
    let pictureUrl: String?
    let scope: String
    let userFavorite: Bool

    var id: String {
        sId
    }

    private enum CodingKeys: String, CodingKey {
        case sId, name, description, pictureUrl, scope, userFavorite
    }
}

struct AgentConfigurationsResponse: Codable {
    let agentConfigurations: [LightAgentConfiguration]
}
