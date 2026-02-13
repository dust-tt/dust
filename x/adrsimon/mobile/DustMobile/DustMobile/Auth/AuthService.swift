import AuthenticationServices
import Foundation

@MainActor
class AuthService: NSObject, ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: StoredUser?
    @Published var isLoading = false
    @Published var authError: String?

    private let keychain = KeychainService()

    private static let tokensKey = "stored_tokens"
    private static let userKey = "stored_user"

    override init() {
        super.init()
        Task {
            await loadStoredSession()
        }
    }

    // MARK: - Session management

    private func loadStoredSession() async {
        do {
            if let user = try await keychain.load(key: Self.userKey, as: StoredUser.self),
               let tokens = try await keychain.load(key: Self.tokensKey, as: StoredTokens.self) {
                // Check if token is expired
                if tokens.expiresAt > Date().timeIntervalSince1970 * 1000 {
                    currentUser = user
                    isAuthenticated = true
                } else {
                    // Try to refresh
                    await refreshTokenIfNeeded(tokens: tokens)
                }
            }
        } catch {
            print("Failed to load stored session: \(error)")
        }
    }

    // MARK: - OAuth PKCE Login

    /// Initiates the OAuth PKCE login flow using ASWebAuthenticationSession.
    /// Port of extension/platforms/chrome/background.ts:475-548
    func login(connection: String? = nil) async {
        isLoading = true
        authError = nil

        let pkce = PKCEHelper.generate()

        var params: [String: String] = [
            "response_type": "code",
            "redirect_uri": DustConfig.oauthCallbackURL,
            "code_challenge_method": "S256",
            "code_challenge": pkce.codeChallenge,
            "provider": "authkit",
        ]

        if let connection {
            params["organization_id"] = connection
        }

        let queryString = params.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        let authURL = "\(DustConfig.usURL)\(APIEndpoints.authorize())?\(queryString)"

        guard let url = URL(string: authURL) else {
            authError = "Invalid auth URL"
            isLoading = false
            return
        }

        do {
            let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
                let session = ASWebAuthenticationSession(
                    url: url,
                    callbackURLScheme: DustConfig.oauthCallbackScheme
                ) { callbackURL, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else if let callbackURL {
                        continuation.resume(returning: callbackURL)
                    } else {
                        continuation.resume(throwing: AuthError.cancelled)
                    }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = false
                session.start()
            }

            // Extract authorization code from callback URL
            guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                  let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {
                if let error = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "error" })?.value {
                    authError = "Authentication error: \(error)"
                } else {
                    authError = "Missing authorization code"
                }
                isLoading = false
                return
            }

            // Exchange code for tokens
            let tokens = try await exchangeCodeForTokens(code: code, codeVerifier: pkce.codeVerifier)
            try await saveTokens(tokens)

            // Fetch user info
            let user = try await fetchMe(accessToken: tokens.accessToken, dustDomain: DustConfig.usURL)
            let storedUser = StoredUser(
                sId: user.sId,
                id: user.id,
                createdAt: user.createdAt,
                provider: user.provider,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                image: user.image,
                workspaces: user.workspaces,
                selectedWorkspace: user.workspaces.first?.sId,
                dustDomain: DustConfig.usURL,
                connectionStrategy: nil,
                connection: connection
            )
            try await saveUser(storedUser)

            currentUser = storedUser
            isAuthenticated = true

        } catch is CancellationError {
            // User cancelled - do nothing
        } catch let error as AuthError where error == .cancelled {
            // User cancelled - do nothing
        } catch {
            authError = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Token exchange

    /// Exchange authorization code for tokens.
    /// Port of extension/platforms/chrome/background.ts:630-670
    private func exchangeCodeForTokens(code: String, codeVerifier: String) async throws -> StoredTokens {
        let tokenParams = [
            "grant_type": "authorization_code",
            "code_verifier": codeVerifier,
            "code": code,
            "redirect_uri": DustConfig.oauthCallbackURL,
        ]

        let body = tokenParams.map { "\($0.key)=\($0.value)" }.joined(separator: "&")

        guard let url = URL(string: "\(DustConfig.usURL)\(APIEndpoints.authenticate())") else {
            throw AuthError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw AuthError.tokenExchangeFailed
        }

        let tokenResponse = try JSONDecoder().decode(OAuthTokenResponse.self, from: data)

        return StoredTokens(
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token ?? "",
            expiresAt: Date().timeIntervalSince1970 * 1000 + Double(tokenResponse.expires_in ?? DustConfig.defaultTokenExpirySeconds) * 1000
        )
    }

    // MARK: - Token refresh

    /// Refresh the access token.
    /// Port of extension/platforms/chrome/background.ts:553-624
    func refreshTokenIfNeeded(tokens: StoredTokens? = nil) async {
        let storedTokens: StoredTokens?
        if let tokens {
            storedTokens = tokens
        } else {
            storedTokens = try? await keychain.load(key: Self.tokensKey, as: StoredTokens.self)
        }

        guard let storedTokens, !storedTokens.refreshToken.isEmpty else {
            await logout()
            return
        }

        let storedUser = try? await keychain.load(key: Self.userKey, as: StoredUser.self)
        guard let user = currentUser ?? storedUser else {
            await logout()
            return
        }

        let tokenParams = [
            "grant_type": "refresh_token",
            "refresh_token": storedTokens.refreshToken,
        ]

        let body = tokenParams.map { "\($0.key)=\($0.value)" }.joined(separator: "&")

        guard let url = URL(string: "\(user.dustDomain)\(APIEndpoints.authenticate())") else {
            await logout()
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = body.data(using: .utf8)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                await logout()
                return
            }

            let tokenResponse = try JSONDecoder().decode(OAuthTokenResponse.self, from: data)

            let newTokens = StoredTokens(
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token ?? storedTokens.refreshToken,
                expiresAt: Date().timeIntervalSince1970 * 1000 + Double(tokenResponse.expires_in ?? DustConfig.defaultTokenExpirySeconds) * 1000
            )

            try await saveTokens(newTokens)
            isAuthenticated = true
        } catch {
            print("Token refresh failed: \(error)")
            await logout()
        }
    }

    // MARK: - Get access token (with auto-refresh)

    func getAccessToken() async -> String? {
        guard let tokens = try? await keychain.load(key: Self.tokensKey, as: StoredTokens.self) else {
            return nil
        }

        // Refresh if expiring within 60 seconds
        let expiryThreshold = Date().timeIntervalSince1970 * 1000 + 60_000
        if tokens.expiresAt < expiryThreshold {
            await refreshTokenIfNeeded(tokens: tokens)
            // Re-read after refresh
            let refreshed = try? await keychain.load(key: Self.tokensKey, as: StoredTokens.self)
            return refreshed?.accessToken
        }

        return tokens.accessToken
    }

    // MARK: - Fetch user info

    private func fetchMe(accessToken: String, dustDomain: String) async throws -> MeUser {
        guard let url = URL(string: "\(dustDomain)\(APIEndpoints.me())") else {
            throw AuthError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("mobile", forHTTPHeaderField: "X-Request-Origin")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw AuthError.userFetchFailed
        }

        let meResponse = try JSONDecoder().decode(MeResponse.self, from: data)
        return meResponse.user
    }

    // MARK: - Workspace selection

    func selectWorkspace(_ workspaceId: String) async {
        guard var user = currentUser else { return }
        user.selectedWorkspace = workspaceId
        try? await saveUser(user)
        currentUser = user
    }

    // MARK: - Logout

    func logout() async {
        await keychain.deleteAll()
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Storage helpers

    private func saveTokens(_ tokens: StoredTokens) async throws {
        try await keychain.save(key: Self.tokensKey, value: tokens)
    }

    private func saveUser(_ user: StoredUser) async throws {
        try await keychain.save(key: Self.userKey, value: user)
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first else {
            return ASPresentationAnchor()
        }
        return window
    }
}

// MARK: - Auth Errors

enum AuthError: LocalizedError, Equatable {
    case cancelled
    case invalidURL
    case tokenExchangeFailed
    case userFetchFailed
    case ssoEnforced

    var errorDescription: String? {
        switch self {
        case .cancelled: return "Login was cancelled."
        case .invalidURL: return "Invalid authentication URL."
        case .tokenExchangeFailed: return "Failed to exchange code for tokens."
        case .userFetchFailed: return "Failed to fetch user information."
        case .ssoEnforced: return "SSO is enforced for this workspace."
        }
    }
}
