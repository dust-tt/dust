import Foundation

struct User: Codable {
    let id: String
    let email: String
    let emailVerified: Bool
    let firstName: String?
    let lastName: String?
    let profilePictureUrl: String?
    let createdAt: Date
    let updatedAt: Date

    var displayName: String {
        let name = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        return name.isEmpty ? email : name
    }
}

struct AuthResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: User
    let expiresIn: Int?
}

struct AuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
}
