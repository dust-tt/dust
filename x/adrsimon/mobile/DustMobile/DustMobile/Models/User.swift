import Foundation

struct UserType: Codable, Identifiable, Equatable {
    let sId: String
    let id: Int
    let createdAt: Int
    let provider: String?
    let username: String
    let email: String
    let firstName: String
    let lastName: String?
    let fullName: String
    let image: String?
}

struct StoredUser: Codable, Equatable {
    let sId: String
    let id: Int
    let createdAt: Int
    let provider: String?
    let username: String
    let email: String
    let firstName: String
    let lastName: String?
    let fullName: String
    let image: String?
    var workspaces: [ExtensionWorkspaceType]
    var selectedWorkspace: String?
    var dustDomain: String
    var connectionStrategy: String?
    var connection: String?
}

extension StoredUser {
    var currentWorkspace: ExtensionWorkspaceType? {
        guard let selectedWorkspace else { return workspaces.first }
        return workspaces.first { $0.sId == selectedWorkspace }
    }

    var userType: UserType {
        UserType(
            sId: sId,
            id: id,
            createdAt: createdAt,
            provider: provider,
            username: username,
            email: email,
            firstName: firstName,
            lastName: lastName,
            fullName: fullName,
            image: image
        )
    }
}
