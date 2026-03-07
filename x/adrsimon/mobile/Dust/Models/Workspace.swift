import Foundation

struct Workspace: Codable, Identifiable {
    var id: String {
        sId
    }

    let sId: String
    let name: String
    let role: String
}

struct DustUser: Codable {
    let sId: String
    let firstName: String
    let lastName: String?
    let image: String?
    let workspaces: [Workspace]
    let selectedWorkspace: String?
}

struct DustUserResponse: Codable {
    let user: DustUser
}
