import Foundation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "TokenProvider")

/// Centralized token manager that provides valid access tokens with automatic refresh.
/// Coalesces concurrent refresh requests so only one refresh call is in-flight at a time.
actor TokenProvider {
    private var accessToken: String
    private var refreshToken: String
    private var expiresAt: Date?
    private var onSessionExpired: (@Sendable () -> Void)?

    /// In-flight refresh task, used to coalesce concurrent refresh requests.
    private var refreshTask: Task<String, Error>?
    /// Set after a refresh failure to avoid repeated doomed attempts.
    private var refreshFailed = false

    init(
        accessToken: String,
        refreshToken: String,
        expiresAt: Date? = nil,
        onSessionExpired: (@Sendable () -> Void)? = nil
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.onSessionExpired = onSessionExpired
    }

    /// Returns the current access token. If the token is known to be expired
    /// (based on in-memory expiry), refreshes proactively. Otherwise returns
    /// the current token and relies on the 401 retry in the API layer as a safety net.
    func validAccessToken() async throws -> String {
        if let expiresAt, Date() >= expiresAt {
            return try await refreshedAccessToken()
        }
        return accessToken
    }

    /// Forces a token refresh (e.g. after receiving a 401).
    /// Coalesces with any in-flight refresh so only one network call happens.
    func refreshedAccessToken() async throws -> String {
        if refreshFailed {
            onSessionExpired?()
            throw AuthError.sessionExpired
        }

        // If a refresh is already in-flight, await its result.
        if let existing = refreshTask {
            return try await existing.value
        }

        let currentRefreshToken = refreshToken
        let task = Task<String, Error> {
            defer { refreshTask = nil }

            do {
                logger.info("Refreshing access token")
                let response = try await AuthService.refreshTokens(refreshToken: currentRefreshToken)
                AuthService.saveTokens(response)
                accessToken = response.accessToken
                refreshToken = response.refreshToken
                if let expiresIn = response.expiresIn {
                    expiresAt = Date().addingTimeInterval(Double(expiresIn))
                }
                logger.info("Token refreshed successfully")
                return response.accessToken
            } catch {
                logger.error("Token refresh failed: \(error)")
                refreshFailed = true
                onSessionExpired?()
                throw error
            }
        }

        refreshTask = task
        return try await task.value
    }
}
