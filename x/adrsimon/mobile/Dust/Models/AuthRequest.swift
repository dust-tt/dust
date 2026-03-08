import Foundation

struct TokenExchangeRequest: Encodable {
    let code: String
    let codeVerifier: String
}

struct TokenRefreshRequest: Encodable {
    let grantType: String = "refresh_token"
    let refreshToken: String
}
