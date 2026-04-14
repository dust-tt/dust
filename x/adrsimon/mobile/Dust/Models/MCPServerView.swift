import Foundation

struct MCPServer: Decodable {
    let sId: String
    let name: String
    let description: String
    let icon: String?
}

struct MCPServerView: Decodable, Identifiable {
    let sId: String
    let name: String?
    let description: String?
    let spaceId: String
    let server: MCPServer

    var id: String { sId }
    var displayName: String { name ?? server.name }
    var displayDescription: String { description ?? server.description }
}

struct MCPServerViewsResponse: Decodable {
    let serverViews: [MCPServerView]
}
