import Foundation

struct SpaceType: Codable, Identifiable, Equatable {
    var id: String { sId }
    let createdAt: Int
    let groupIds: [String]
    let isRestricted: Bool
    let kind: String
    let name: String
    let sId: String
    let updatedAt: Int
}

struct DataSourceType: Codable, Equatable {
    let id: Int
    let sId: String
    let createdAt: Int
    let name: String
    let description: String?
    let connectorProvider: String?
}

struct DataSourceViewType: Codable, Equatable {
    let category: String
    let createdAt: Int
    let dataSource: DataSourceType
    let id: Int
    let kind: String
    let parentsIn: [String]?
    let sId: String
    let updatedAt: Int
    let spaceId: String
}

struct ContentNodeType: Codable, Equatable, Identifiable {
    var id: String { internalId }
    let expandable: Bool
    let internalId: String
    let lastUpdatedAt: Int?
    let mimeType: String
    let parentInternalId: String?
    let sourceUrl: String?
    let title: String
    let type: String // "document", "table", "folder"
}

struct DataSourceViewContentNodeType: Codable, Equatable, Identifiable {
    var id: String { internalId }
    let expandable: Bool
    let internalId: String
    let lastUpdatedAt: Int?
    let mimeType: String
    let parentInternalId: String?
    let sourceUrl: String?
    let title: String
    let type: String
    let dataSourceView: DataSourceViewType
}

struct SpacesResponse: Codable {
    let spaces: [SpaceType]
}

struct DataSourceViewsResponse: Codable {
    let dataSourceViews: [DataSourceViewType]
}

struct ContentNodesResponse: Codable {
    let nodes: [DataSourceViewContentNodeType]
}
