package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpEngine
import com.dust.mobile.core.network.HttpRequest
import com.dust.mobile.core.network.HttpResponse
import com.dust.mobile.core.repository.CapabilityRepository
import com.dust.mobile.core.repository.ConversationRepository
import com.dust.mobile.core.repository.ConversationAction
import com.dust.mobile.core.repository.FileRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test

class ApiClientTest {
    @Test
    fun `authenticated get retries once after 401 refresh`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(statusCode = 401, body = "expired".encodeToByteArray()),
            HttpResponse(statusCode = 200, body = """{"ok":true}""".encodeToByteArray()),
        )
        val apiClient = ApiClient(AppConfig.production(), engine)
        val store = InMemoryTokenStore()
        val provider = TokenProvider(
            accessToken = "old",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = store,
        )

        val result = apiClient.authenticatedGet<TestResponse>("/test", provider)

        assertEquals(true, result.ok)
        assertEquals("Bearer old", engine.requests[0].headers["Authorization"])
        assertEquals("Bearer new", engine.requests[1].headers["Authorization"])
        assertEquals(AuthTokens("new", "new-refresh"), store.saved)
    }

    @Test
    fun `conversation tool updates send server view id as snake case`() = runTest {
        val engine = FakeHttpEngine(HttpResponse(statusCode = 200))
        val apiClient = ApiClient(AppConfig.production(), engine)
        val repository = CapabilityRepository(apiClient)
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        repository.updateTool(
            action = ConversationAction.ADD,
            workspaceId = "w1",
            conversationId = "c1",
            mcpServerViewId = "sv1",
            tokenProvider = provider,
        )

        assertEquals(
            """{"action":"add","mcp_server_view_id":"sv1"}""",
            engine.requests.single().body?.decodeToString(),
        )
    }

    @Test
    fun `content fragment posts knowledge node payload`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(statusCode = 200, body = """{"contentFragment":{"sId":"cf1"}}""".encodeToByteArray()),
        )
        val apiClient = ApiClient(AppConfig.production(), engine)
        val repository = FileRepository(apiClient)
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        repository.postContentFragment(
            workspaceId = "w1",
            conversationId = "c1",
            payload = ContentFragmentPayload.node(
                title = "Handbook",
                nodeId = "node-1",
                nodeDataSourceViewId = "dsv-1",
                context = ContentFragmentContext(profilePictureUrl = "avatar.png"),
            ),
            tokenProvider = provider,
        )

        assertEquals(
            "https://dust.tt/api/w/w1/assistant/conversations/c1/content_fragment",
            engine.requests.single().url,
        )
        assertEquals(
            """{"title":"Handbook","nodeId":"node-1","nodeDataSourceViewId":"dsv-1","context":{"profilePictureUrl":"avatar.png"}}""",
            engine.requests.single().body?.decodeToString(),
        )
    }

    @Test
    fun `answer question omits absent custom response`() = runTest {
        val engine = FakeHttpEngine(HttpResponse(statusCode = 200))
        val apiClient = ApiClient(AppConfig.production(), engine)
        val repository = ConversationRepository(apiClient)
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        repository.answerQuestion(
            workspaceId = "w1",
            conversationId = "c1",
            messageId = "m1",
            actionId = "a1",
            answer = UserQuestionAnswer(selectedOptions = listOf(1), customResponse = null),
            tokenProvider = provider,
        )

        assertEquals(
            "https://dust.tt/api/v1/w/w1/assistant/conversations/c1/messages/m1/answer-question",
            engine.requests.single().url,
        )
        assertEquals(
            """{"actionId":"a1","answer":{"selectedOptions":[1]}}""",
            engine.requests.single().body?.decodeToString(),
        )
    }

    @Test
    fun `http cancellation is not wrapped as a network error`() = runTest {
        val apiClient = ApiClient(
            AppConfig.production(),
            object : HttpEngine {
                override suspend fun execute(request: HttpRequest): HttpResponse {
                    throw CancellationException("cancelled")
                }
            },
        )

        try {
            apiClient.get<TestResponse>("/test")
            fail("Expected CancellationException")
        } catch (error: CancellationException) {
            assertEquals("cancelled", error.message)
        }
    }

    @Test
    fun `json cancellation is not wrapped as a decoding error`() = runTest {
        val apiClient = ApiClient(
            AppConfig.production(),
            FakeHttpEngine(HttpResponse(statusCode = 200, body = """{"ok":true}""".encodeToByteArray())),
        )

        try {
            apiClient.get("/test", CancelingResponseSerializer)
            fail("Expected CancellationException")
        } catch (error: CancellationException) {
            assertEquals("decode cancelled", error.message)
        }
    }
}

@Serializable
private data class TestResponse(val ok: Boolean)

private object CancelingResponseSerializer : KSerializer<TestResponse> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("CancelingResponse")

    override fun deserialize(decoder: Decoder): TestResponse {
        throw CancellationException("decode cancelled")
    }

    override fun serialize(encoder: Encoder, value: TestResponse) = Unit
}

class FakeHttpEngine(
    private vararg val responses: HttpResponse,
) : HttpEngine {
    val requests = mutableListOf<HttpRequest>()
    private var index = 0

    override suspend fun execute(request: HttpRequest): HttpResponse {
        requests.add(request)
        return responses.getOrNull(index++) ?: HttpResponse(statusCode = 200, body = "{}".encodeToByteArray())
    }
}

private class InMemoryTokenStore : TokenStore {
    var saved: AuthTokens? = null

    override fun loadTokens(): AuthTokens? = saved

    override fun saveTokens(response: AuthResponse) {
        saved = AuthTokens(response.accessToken, response.refreshToken)
    }

    override fun clearTokens() {
        saved = null
    }
}

private fun authResponse(accessToken: String, refreshToken: String): AuthResponse =
    AuthResponse(
        accessToken = accessToken,
        refreshToken = refreshToken,
        user = User(id = "u1", email = "user@dust.tt"),
        expiresIn = 3600,
    )
