package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpResponse
import com.dust.mobile.core.repository.TranscriptionRepository
import com.dust.mobile.core.repository.parseTranscriptionSse
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TranscriptionRepositoryTest {
    @Test
    fun `fetches single-use realtime transcription token`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"token":"scribe-token","baseUri":"wss://api.eu.elevenlabs.io"}"""
                    .encodeToByteArray(),
            ),
        )
        val repository = TranscriptionRepository(ApiClient(AppConfig.production(), engine))

        val token = repository.fetchRealtimeToken("w1", testTokenProvider())

        assertEquals("scribe-token", token.token)
        assertEquals("wss://api.eu.elevenlabs.io", token.baseUri)
        assertEquals(
            "https://dust.tt/api/w/w1/services/transcribe/get-token",
            engine.requests.single().url,
        )
        assertEquals("Bearer token", engine.requests.single().headers["Authorization"])
    }

    @Test
    fun `parses full transcript text from sse`() {
        val transcript = parseTranscriptionSse(
            """
            data: {"type":"partialTranscript","text":"hel"}
            data: {"type":"fullTranscript","fullTranscript":[{"type":"mention","name":"dust"},{"type":"text","text":" hello"}]}
            data: done
            """.trimIndent(),
        )

        assertEquals("@dust hello", transcript)
    }

    @Test
    fun `preserves non-empty whitespace transcript`() {
        val transcript = parseTranscriptionSse(
            """
            data: {"type":"fullTranscript","fullTranscript":" "}
            data: done
            """.trimIndent(),
        )

        assertEquals(" ", transcript)
    }

    @Test
    fun `uploads audio to transcription endpoint and parses response`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    data: {"type":"fullTranscript","fullTranscript":"hello from audio"}
                    data: done
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val apiClient = ApiClient(AppConfig.production(), engine)
        val repository = TranscriptionRepository(apiClient)

        val transcript = repository.transcribe(
            workspaceId = "w1",
            fileData = "audio".encodeToByteArray(),
            fileName = "recording.m4a",
            mimeType = "audio/mp4",
            tokenProvider = testTokenProvider(),
        )

        assertEquals("hello from audio", transcript)
        val request = engine.requests.single()
        assertEquals("https://dust.tt/api/w/w1/services/transcribe", request.url)
        assertEquals("Bearer token", request.headers["Authorization"])
        assertTrue(request.headers.getValue("Content-Type").startsWith("multipart/form-data; boundary="))
        val body = request.body?.decodeToString().orEmpty()
        assertTrue(body.contains("filename=\"recording.m4a\""))
        assertTrue(body.contains("Content-Type: audio/mp4"))
    }
}

private fun testTokenProvider() = TokenProvider(
    accessToken = "token",
    refreshToken = "refresh",
    authApi = object : AuthApi {
        override suspend fun refreshTokens(refreshToken: String): AuthResponse =
            AuthResponse(
                accessToken = "token",
                refreshToken = "refresh",
                user = User(id = "u1", email = "user@dust.tt"),
            )
    },
    tokenStore = object : TokenStore {
        override fun loadTokens(): AuthTokens? = null
        override fun saveTokens(response: AuthResponse) = Unit
        override fun clearTokens() = Unit
    },
)
