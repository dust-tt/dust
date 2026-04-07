import AuthenticationServices
import Foundation
import os
import UIKit

enum AuthState {
    case loading
    case unauthenticated
    case authenticating
    case authenticated(user: User, tokenProvider: TokenProvider)
    case error(String)
}

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Auth")

@MainActor
final class AuthViewModel: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var state: AuthState = .loading

    private var pkcePair: AuthService.PKCEPair?
    private var webAuthSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        Task { [weak self] in
            await self?.restoreSession()
        }
    }

    // MARK: - ASWebAuthenticationPresentationContextProviding

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
            return scene?.windows.first ?? ASPresentationAnchor()
        }
    }

    // MARK: - Login

    func login() {
        do {
            let pkce = try AuthService.generatePKCE()
            pkcePair = pkce

            guard let loginURL = AuthService.buildLoginURL(codeChallenge: pkce.codeChallenge) else {
                state = .error("Failed to build login URL")
                return
            }

            state = .authenticating

            let session = ASWebAuthenticationSession(
                url: loginURL,
                callbackURLScheme: AppConfig.callbackURLScheme
            ) { [weak self] callbackURL, error in
                Task { @MainActor [weak self] in
                    guard let self else { return }

                    if let error {
                        pkcePair = nil
                        webAuthSession = nil
                        if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                            state = .unauthenticated
                        } else {
                            state = .error(error.localizedDescription)
                        }
                        return
                    }

                    guard let callbackURL,
                          let code = AuthService.extractCode(from: callbackURL)
                    else {
                        state = .error("No authorization code received")
                        return
                    }

                    await exchangeCode(code)
                }
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
            webAuthSession = session
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    // MARK: - Handle deep link callback (fallback)

    func handleCallbackURL(_ url: URL) {
        guard url.scheme == AppConfig.callbackURLScheme,
              let code = AuthService.extractCode(from: url)
        else {
            return
        }

        Task { await exchangeCode(code) }
    }

    // MARK: - Logout

    func logout() {
        let accessToken = AuthService.loadTokens()?.accessToken
        AuthService.clearTokens()
        state = .unauthenticated

        if let accessToken {
            Task {
                do {
                    try await AuthService.serverLogout(accessToken: accessToken)
                } catch {
                    logger.error("Server logout failed: \(error)")
                }
            }
        }
    }

    // MARK: - Private

    private func makeTokenProvider(
        accessToken: String,
        refreshToken: String,
        expiresIn: Int?
    ) -> TokenProvider {
        let expiresAt = expiresIn.map { Date().addingTimeInterval(Double($0)) }
        return TokenProvider(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt,
            onSessionExpired: { [weak self] in
                Task { @MainActor [weak self] in
                    self?.handleSessionExpired()
                }
            }
        )
    }

    private func handleSessionExpired() {
        guard case .authenticated = state else { return }
        logger.warning("Session expired — logging out")
        AuthService.clearTokens()
        state = .unauthenticated
    }

    private func restoreSession() async {
        guard let tokens = AuthService.loadTokens() else {
            state = .unauthenticated
            return
        }

        do {
            let response = try await AuthService.refreshTokens(refreshToken: tokens.refreshToken)
            AuthService.saveTokens(response)
            let provider = makeTokenProvider(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn
            )
            state = .authenticated(user: response.user, tokenProvider: provider)
        } catch {
            AuthService.clearTokens()
            state = .unauthenticated
        }
    }

    private func exchangeCode(_ code: String) async {
        guard let pkcePair else {
            state = .error("Missing PKCE verifier")
            return
        }

        do {
            let response = try await AuthService.exchangeCodeForTokens(
                code: code,
                codeVerifier: pkcePair.codeVerifier
            )
            AuthService.saveTokens(response)
            self.pkcePair = nil
            webAuthSession = nil
            let provider = makeTokenProvider(
                accessToken: response.accessToken,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn
            )
            state = .authenticated(user: response.user, tokenProvider: provider)
        } catch {
            self.pkcePair = nil
            webAuthSession = nil
            state = .error(error.localizedDescription)
        }
    }
}
