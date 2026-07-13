package com.dust.mobile.core.auth

import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens

interface AuthApi {
    suspend fun refreshTokens(refreshToken: String): AuthResponse
}

interface TokenStore {
    fun loadTokens(): AuthTokens?
    fun saveTokens(response: AuthResponse)
    fun clearTokens()
}

sealed class AuthError(message: String) : Exception(message) {
    data object PkceGenerationFailed : AuthError("Failed to generate PKCE challenge")
    data object NoAuthorizationCode : AuthError("No authorization code received")
    data object SessionExpired : AuthError("Session expired. Please sign in again.")
    data object TokenUnavailable : AuthError("Token access is unavailable for this session.")
}

data class PkcePair(
    val codeVerifier: String,
    val codeChallenge: String,
)
