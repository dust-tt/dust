import Foundation

struct StoredTokens: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Double
}

struct OAuthTokenResponse: Codable {
    let access_token: String
    let refresh_token: String?
    let expires_in: Int?
    let id_token: String?
    let authentication_method: String?
}

struct MeResponse: Codable {
    let user: MeUser
}

struct MeUser: Codable {
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
    let workspaces: [ExtensionWorkspaceType]
    let selectedWorkspace: String?
}
