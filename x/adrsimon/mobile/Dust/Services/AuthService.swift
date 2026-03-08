import AuthenticationServices
import CryptoKit
import Foundation

enum AuthError: LocalizedError {
    case pkceGenerationFailed
    case noAuthorizationCode
    case authenticationCancelled

    var errorDescription: String? {
        switch self {
        case .pkceGenerationFailed:
            "Failed to generate PKCE challenge"
        case .noAuthorizationCode:
            "No authorization code received"
        case .authenticationCancelled:
            "Authentication was cancelled"
        }
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum AuthService {
    // MARK: - PKCE

    struct PKCEPair {
        let codeVerifier: String
        let codeChallenge: String
    }

    static func generatePKCE() throws -> PKCEPair {
        var buffer = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, buffer.count, &buffer)
        guard status == errSecSuccess else {
            throw AuthError.pkceGenerationFailed
        }

        let codeVerifier = Data(buffer).base64URLEncodedString()
        let codeChallenge = Data(SHA256.hash(data: Data(codeVerifier.utf8))).base64URLEncodedString()

        return PKCEPair(codeVerifier: codeVerifier, codeChallenge: codeChallenge)
    }

    // MARK: - Login URL

    static func buildLoginURL(codeChallenge: String) -> URL? {
        var components = URLComponents(string: "\(AppConfig.apiBaseURL)\(AppConfig.Endpoints.login)")
        components?.queryItems = [
            URLQueryItem(name: "redirect_uri", value: AppConfig.callbackURL),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "screenHint", value: "sign-in"),
        ]
        return components?.url
    }

    // MARK: - Token Exchange

    static func exchangeCodeForTokens(code: String, codeVerifier: String) async throws -> AuthResponse {
        try await APIClient.post(
            AppConfig.Endpoints.authenticate,
            body: TokenExchangeRequest(code: code, codeVerifier: codeVerifier)
        )
    }

    // MARK: - Token Refresh

    static func refreshTokens(refreshToken: String) async throws -> AuthResponse {
        try await APIClient.post(
            AppConfig.Endpoints.authenticate,
            body: TokenRefreshRequest(refreshToken: refreshToken)
        )
    }

    // MARK: - Server Logout

    static func serverLogout(accessToken: String) async throws {
        struct EmptyBody: Encodable {}
        try await APIClient.postNoResponse(
            AppConfig.Endpoints.logout,
            body: EmptyBody(),
            accessToken: accessToken
        )
    }

    // MARK: - Token Expiry

    static func isTokenExpired() -> Bool {
        guard let expiryString = KeychainService.load(.tokenExpiry),
              let expiryInterval = TimeInterval(expiryString)
        else {
            return true
        }
        return Date().timeIntervalSince1970 >= expiryInterval
    }

    // MARK: - Keychain Persistence

    static func saveTokens(_ response: AuthResponse) {
        KeychainService.save(response.accessToken, for: .accessToken)
        KeychainService.save(response.refreshToken, for: .refreshToken)

        if let expiresIn = response.expiresIn {
            let expiry = Date().timeIntervalSince1970 + Double(expiresIn)
            KeychainService.save(String(expiry), for: .tokenExpiry)
        }
    }

    static func loadTokens() -> AuthTokens? {
        guard let accessToken = KeychainService.load(.accessToken),
              let refreshToken = KeychainService.load(.refreshToken)
        else {
            return nil
        }
        return AuthTokens(accessToken: accessToken, refreshToken: refreshToken)
    }

    static func clearTokens() {
        KeychainService.deleteAll()
    }

    // MARK: - Dust User

    static func fetchDustUser(accessToken: String) async throws -> DustUser {
        let response: DustUserResponse = try await APIClient.get(
            AppConfig.Endpoints.user,
            accessToken: accessToken,
            snakeCase: false
        )
        return response.user
    }

    // MARK: - Parse Callback

    static func extractCode(from url: URL) -> String? {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        return components?.queryItems?.first(where: { $0.name == "code" })?.value
    }
}
