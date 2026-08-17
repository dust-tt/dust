package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthService
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import com.dust.mobile.core.network.HttpResponse
import java.util.Base64
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthServiceTest {
    @Test
    fun `builds RFC7636 S256 challenge`() {
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), FakeHttpEngine()))

        val challenge = service.challengeForVerifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")

        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", challenge)
    }

    @Test
    fun `builds WorkOS login URL with callback and challenge`() {
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), FakeHttpEngine()))

        val url = service.buildLoginUrl("challenge")

        assertTrue(url.startsWith("https://dust.tt/api/workos/login?"))
        assertTrue(url.contains("redirect_uri=dust%3A%2F%2Fauth"))
        assertTrue(url.contains("code_challenge=challenge"))
        assertTrue(url.contains("code_challenge_method=S256"))
        assertTrue(url.contains("screenHint=sign-in"))
    }

    @Test
    fun `builds WorkOS signup URL with callback and challenge`() {
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), FakeHttpEngine()))

        val url = service.buildSignUpUrl("challenge")

        assertTrue(url.startsWith("https://dust.tt/api/workos/login?"))
        assertTrue(url.contains("redirect_uri=dust%3A%2F%2Fauth"))
        assertTrue(url.contains("code_challenge=challenge"))
        assertTrue(url.contains("code_challenge_method=S256"))
        assertTrue(url.contains("screenHint=sign-up"))
    }

    @Test
    fun `extracts code from configured auth callback`() {
        val config = AppConfig(
            apiBaseUrl = "https://dust.tt",
            appUrl = "https://app.dust.tt",
            callbackScheme = "dust-dev",
            callbackHost = "callback",
        )
        val service = AuthService(config, ApiClient(config, FakeHttpEngine()))

        assertEquals("auth code", service.extractCode("dust-dev://callback?code=auth%20code"))
    }

    @Test
    fun `extractCode rejects unexpected callback host`() {
        val config = AppConfig(
            apiBaseUrl = "https://dust.tt",
            appUrl = "https://app.dust.tt",
            callbackScheme = "dust-dev",
            callbackHost = "callback",
        )
        val service = AuthService(config, ApiClient(config, FakeHttpEngine()))

        assertNull(service.extractCode("dust-dev://auth?code=abc"))
    }

    @Test
    fun `extractCode rejects blank authorization code`() {
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), FakeHttpEngine()))

        assertNull(service.extractCode("dust://auth?code="))
    }

    @Test
    fun `exchanges auth code with snake case verifier body`() = runTest {
        val engine = FakeHttpEngine(authResponse())
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), engine))

        service.exchangeCodeForTokens(code = "auth-code", codeVerifier = "verifier")

        assertEquals(
            """{"code":"auth-code","code_verifier":"verifier"}""",
            engine.requests.single().body?.decodeToString(),
        )
    }

    @Test
    fun `refreshes tokens with snake case refresh body`() = runTest {
        val engine = FakeHttpEngine(authResponse())
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), engine))

        service.refreshTokens(refreshToken = "refresh")

        assertEquals(
            """{"grant_type":"refresh_token","refresh_token":"refresh"}""",
            engine.requests.single().body?.decodeToString(),
        )
    }

    @Test
    fun `logout revokes the WorkOS session from the access token`() = runTest {
        val engine = FakeHttpEngine(HttpResponse(statusCode = 200))
        val service = AuthService(AppConfig.production(), ApiClient(AppConfig.production(), engine))
        val payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"sid":"session_123"}""".encodeToByteArray())

        service.serverLogout("header.$payload.signature")

        val request = engine.requests.single()
        assertEquals(HttpMethod.POST, request.method)
        assertEquals("https://dust.tt/api/workos/revoke-session", request.url)
        assertEquals("Bearer header.$payload.signature", request.headers["Authorization"])
        assertEquals("""{"session_id":"session_123"}""", request.body?.decodeToString())
    }

    private fun authResponse(): HttpResponse =
        HttpResponse(
            statusCode = 200,
            body = """
                {
                  "accessToken": "access",
                  "refreshToken": "refresh",
                  "user": {
                    "id": "u1",
                    "email": "user@dust.tt"
                  },
                  "expiresIn": 3600
                }
            """.trimIndent().encodeToByteArray(),
        )
}
