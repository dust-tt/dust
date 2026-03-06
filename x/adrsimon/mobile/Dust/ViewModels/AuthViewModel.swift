import AuthenticationServices
import Foundation
import os
import UIKit

enum AuthState {
    case loading
    case unauthenticated
    case authenticating
    case authenticated(User)
    case error(String)
}

private let logger = Logger(subsystem: "com.dust.mobile", category: "Auth")

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
            self.pkcePair = pkce

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
                        if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                            self.webAuthSession = nil
                            self.state = .unauthenticated
                        } else {
                            self.state = .error(error.localizedDescription)
                        }
                        return
                    }

                    guard let callbackURL,
                          let code = AuthService.extractCode(from: callbackURL) else {
                        self.state = .error("No authorization code received")
                        return
                    }

                    await self.exchangeCode(code)
                }
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
            self.webAuthSession = session
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    // MARK: - Handle deep link callback (fallback)

    func handleCallbackURL(_ url: URL) {
        guard url.scheme == AppConfig.callbackURLScheme,
              let code = AuthService.extractCode(from: url) else {
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

    private func restoreSession() async {
        guard let tokens = AuthService.loadTokens() else {
            state = .unauthenticated
            return
        }

        do {
            let response = try await AuthService.refreshTokens(refreshToken: tokens.refreshToken)
            AuthService.saveTokens(response)
            state = .authenticated(response.user)
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
            self.webAuthSession = nil
            state = .authenticated(response.user)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
