import Foundation

struct LightWorkspaceType: Codable, Identifiable, Equatable {
    let id: Int
    let sId: String
    let name: String
    let role: String
    let segmentation: String?
    let whiteListedProviders: [String]?
    let defaultEmbeddingProvider: String?
}

struct WorkspaceType: Codable, Identifiable, Equatable {
    let id: Int
    let sId: String
    let name: String
    let role: String
    let segmentation: String?
    let whiteListedProviders: [String]?
    let defaultEmbeddingProvider: String?
    let ssoEnforced: Bool?
}

struct ExtensionWorkspaceType: Codable, Identifiable, Equatable {
    let id: Int
    let sId: String
    let name: String
    let role: String
    let segmentation: String?
    let whiteListedProviders: [String]?
    let defaultEmbeddingProvider: String?
    let ssoEnforced: Bool?
    let blacklistedDomains: [String]?
}
