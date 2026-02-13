import Foundation

struct AgentModelConfiguration: Codable, Equatable {
    let providerId: String
    let modelId: String
    let temperature: Double
}

struct AgentUsageType: Codable, Equatable {
    let messageCount: Int
    let conversationCount: Int
    let userCount: Int
    let timePeriodSec: Int
}

struct LightAgentConfigurationType: Codable, Identifiable, Equatable {
    let id: Int
    let sId: String
    let version: Int
    let versionCreatedAt: String?
    let versionAuthorId: Int?
    let instructions: String?
    let model: AgentModelConfiguration
    let status: String
    let scope: String
    let userFavorite: Bool
    let name: String
    let description: String
    let pictureUrl: String
    let lastAuthors: [String]?
    let usage: AgentUsageType?
    let maxStepsPerRun: Int
    let templateId: String?
}

struct AgentMentionType: Codable, Equatable {
    let configurationId: String
}
