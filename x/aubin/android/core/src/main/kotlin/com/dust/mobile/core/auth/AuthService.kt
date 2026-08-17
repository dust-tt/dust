package com.dust.mobile.core.auth

import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.TokenExchangeRequest
import com.dust.mobile.core.model.TokenRefreshRequest
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

class AuthService(
    private val config: AppConfig,
    private val apiClient: ApiClient,
    private val secureRandom: SecureRandom = SecureRandom(),
) : AuthApi {
    fun generatePkce(): PkcePair {
        val random = ByteArray(PKCE_RANDOM_BYTES)
        secureRandom.nextBytes(random)
        val verifier = random.base64Url()
        return PkcePair(
            codeVerifier = verifier,
            codeChallenge = challengeForVerifier(verifier),
        )
    }

    fun challengeForVerifier(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(verifier.encodeToByteArray())
        return digest.base64Url()
    }

    fun buildLoginUrl(codeChallenge: String): String {
        return buildAuthorizationUrl(codeChallenge = codeChallenge, screenHint = "sign-in")
    }

    fun buildSignUpUrl(codeChallenge: String): String {
        return buildAuthorizationUrl(codeChallenge = codeChallenge, screenHint = "sign-up")
    }

    private fun buildAuthorizationUrl(codeChallenge: String, screenHint: String): String {
        val params = listOf(
            "redirect_uri" to config.callbackUrl,
            "code_challenge" to codeChallenge,
            "code_challenge_method" to "S256",
            "screenHint" to screenHint,
        ).joinToString("&") { (key, value) -> "${key.urlEncode()}=${value.urlEncode()}" }
        return "${config.apiBaseUrl}${Endpoints.LOGIN}?$params"
    }

    suspend fun exchangeCodeForTokens(code: String, codeVerifier: String): AuthResponse =
        apiClient.post<TokenExchangeRequest, AuthResponse>(
            endpoint = Endpoints.AUTHENTICATE,
            body = TokenExchangeRequest(code = code, codeVerifier = codeVerifier),
        )

    override suspend fun refreshTokens(refreshToken: String): AuthResponse =
        apiClient.post<TokenRefreshRequest, AuthResponse>(
            endpoint = Endpoints.AUTHENTICATE,
            body = TokenRefreshRequest(refreshToken = refreshToken),
        )

    suspend fun serverLogout(accessToken: String) {
        val sessionId = accessToken.sessionIdOrNull() ?: return
        apiClient.send(
            Endpoints.REVOKE_SESSION,
            com.dust.mobile.core.network.HttpMethod.POST,
            RevokeSessionRequest(sessionId),
            accessToken,
        )
    }

    fun extractCode(callbackUrl: String): String? {
        val uri = runCatching { URI(callbackUrl) }.getOrNull() ?: return null
        if (uri.scheme != config.callbackScheme || uri.host != config.callbackHost) {
            return null
        }
        return uri.rawQuery
            ?.split("&")
            ?.firstNotNullOfOrNull { part ->
                val pieces = part.split("=", limit = 2)
                val key = pieces.firstOrNull()?.urlDecode()
                val value = pieces.getOrNull(1)?.urlDecode()
                if (key == "code" && !value.isNullOrBlank()) value else null
            }
    }

    private companion object {
        const val PKCE_RANDOM_BYTES = 32
    }
}

@Serializable
private data class AccessTokenClaims(val sid: String? = null)

@Serializable
private data class RevokeSessionRequest(@SerialName("session_id") val sessionId: String)

private fun String.sessionIdOrNull(): String? = runCatching {
    val payload = split('.').getOrNull(1) ?: return@runCatching null
    val claimsJson = Base64.getUrlDecoder().decode(payload).decodeToString()
    DustJson.decodeFromString<AccessTokenClaims>(claimsJson).sid
}.getOrNull()

private fun ByteArray.base64Url(): String =
    Base64.getUrlEncoder().withoutPadding().encodeToString(this)

private fun String.urlEncode(): String =
    URLEncoder.encode(this, StandardCharsets.UTF_8.toString()).replace("+", "%20")

private fun String.urlDecode(): String =
    java.net.URLDecoder.decode(this, StandardCharsets.UTF_8.toString())
