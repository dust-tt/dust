package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.CreateMessagePayload
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpEngine
import com.dust.mobile.core.network.HttpMethod
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
    fun `conversation title search uses existing list pages without sending query text`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"conversations":[{"sId":"match","title":"Customer & roadmap","created":1,"updated":1,"unread":false,"actionRequired":false},{"sId":"other","title":"Other work","created":1,"updated":1,"unread":false,"actionRequired":false}],"hasMore":true,"lastValue":"next"}""".encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        val response = repository.searchConversations("w1", "Customer & roadmap", provider, "previous")

        val request = engine.requests.single()
        assertEquals(HttpMethod.GET, request.method)
        assertEquals("https://dust.tt/api/w/w1/assistant/conversations?limit=100&lastValue=previous", request.url)
        assertEquals(null, request.body)
        assertEquals(true, response.hasMore)
        assertEquals("next", response.lastValue)
        assertEquals(listOf("match"), response.conversations.map { it.sId })
    }

    @Test
    fun `create conversation dispatches authenticated post payload`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"conversation":{"sId":"c1","created":1,"updated":1,"unread":false,"actionRequired":false}}"""
                    .encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        repository.createConversation(
            workspaceId = "w1",
            request = CreateConversationRequest(
                message = CreateMessagePayload(
                    content = "Hello",
                    mentions = listOf(MentionPayload("dust")),
                    context = MessageContext(timezone = "Europe/Paris"),
                ),
            ),
            tokenProvider = provider,
        )

        val request = engine.requests.single()
        assertEquals(HttpMethod.POST, request.method)
        assertEquals("https://dust.tt/api/w/w1/assistant/conversations", request.url)
        assertEquals("Bearer token", request.headers["Authorization"])
        assertEquals(
            """{"title":null,"visibility":"unlisted","spaceId":null,"message":{"content":"Hello","mentions":[{"configurationId":"dust"}],"context":{"timezone":"Europe/Paris","profilePictureUrl":null}},"contentFragments":[]}""",
            request.body?.decodeToString(),
        )
    }

    @Test
    fun `fetch conversation hydrates an exact conversation link`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"conversation":{"sId":"c1","created":1,"updated":2,"title":"Linked conversation","unread":true,"actionRequired":false}}"""
                    .encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        val conversation = repository.fetchConversation("w1", "c1", provider)

        assertEquals("c1", conversation.sId)
        assertEquals("Linked conversation", conversation.title)
        assertEquals("https://dust.tt/api/w/w1/assistant/conversations/c1", engine.requests.single().url)
    }

    @Test
    fun `conversation reply dispatches authenticated post payload`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"message":{"id":1,"sId":"m1","type":"user_message","created":1,"visibility":"visible","version":0,"rank":1,"content":"Hello"}}"""
                    .encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))
        val provider = TokenProvider(
            accessToken = "token",
            refreshToken = "refresh",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse =
                    authResponse(accessToken = "new", refreshToken = "new-refresh")
            },
            tokenStore = InMemoryTokenStore(),
        )

        repository.postMessage(
            workspaceId = "w1",
            conversationId = "c1",
            request = PostMessageRequest(
                content = "Hello",
                mentions = listOf(MentionPayload("dust")),
                context = MessageContext(timezone = "Europe/Paris"),
            ),
            tokenProvider = provider,
        )

        val request = engine.requests.single()
        assertEquals(HttpMethod.POST, request.method)
        assertEquals("https://dust.tt/api/w/w1/assistant/conversations/c1/messages", request.url)
        assertEquals("Bearer token", request.headers["Authorization"])
        assertEquals(
            """{"content":"Hello","mentions":[{"configurationId":"dust"}],"context":{"timezone":"Europe/Paris","profilePictureUrl":null}}""",
            request.body?.decodeToString(),
        )
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
    fun `conversation pagination forwards the opaque cursor`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"conversations":[],"hasMore":false,"lastValue":null}""".encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))

        repository.fetchConversations(
            workspaceId = "w1",
            tokenProvider = validTokenProvider(),
            limit = 25,
            lastValue = "1700000000000:c1",
        )

        assertEquals(
            "https://dust.tt/api/w/w1/assistant/conversations?limit=25&lastValue=1700000000000%3Ac1",
            engine.requests.single().url,
        )
    }

    @Test
    fun `knowledge search forwards the opaque cursor`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"nodes":[],"nextPageCursor":null,"resultsCount":0}""".encodeToByteArray(),
            ),
        )
        val repository = CapabilityRepository(ApiClient(AppConfig.production(), engine))

        repository.searchKnowledge(
            workspaceId = "w1",
            query = "roadmap",
            tokenProvider = validTokenProvider(),
            cursor = "next page",
        )

        val request = engine.requests.single()
        assertEquals("https://dust.tt/api/w/w1/search?cursor=next%20page", request.url)
        assertEquals(
            """{"query":"roadmap","viewType":"all","includeDataSources":false,"limit":25}""",
            request.body?.decodeToString(),
        )
    }

    @Test
    fun `bulk read rejects an empty conversation list before dispatch`() = runTest {
        val engine = FakeHttpEngine(HttpResponse(statusCode = 200))
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))

        try {
            repository.bulkMarkAsRead("w1", emptyList(), validTokenProvider())
            fail("Expected an empty bulk action to be rejected")
        } catch (error: IllegalArgumentException) {
            assertEquals("At least one conversation ID is required", error.message)
        }

        assertEquals(0, engine.requests.size)
    }

    @Test
    fun `file upload uses the conversation upload contract`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """{"file":{"sId":"f1","uploadUrl":"/api/w/w1/files/f1"}}""".encodeToByteArray(),
            ),
            HttpResponse(
                statusCode = 200,
                body = """{"file":{"sId":"f1"}}""".encodeToByteArray(),
            ),
        )
        val repository = FileRepository(ApiClient(AppConfig.production(), engine))

        val fileId = repository.uploadFile(
            workspaceId = "w1",
            fileName = "brief.txt",
            contentType = "text/plain",
            fileData = "hello".encodeToByteArray(),
            tokenProvider = validTokenProvider(),
        )

        assertEquals("f1", fileId)
        assertEquals("https://dust.tt/api/w/w1/files", engine.requests[0].url)
        assertEquals(
            """{"contentType":"text/plain","fileName":"brief.txt","fileSize":5,"useCase":"conversation"}""",
            engine.requests[0].body?.decodeToString(),
        )
        assertEquals("https://dust.tt/api/w/w1/files/f1", engine.requests[1].url)
        assertEquals("Bearer token", engine.requests[1].headers["Authorization"])
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
    fun `project conversations decode their dedicated response contract`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {
                      "conversations": [{
                        "id": "c1",
                        "title": "Quarterly planning",
                        "created": 1700000000000,
                        "updated": 1700000100000,
                        "replyCount": 4,
                        "unreadMessageCount": 2,
                        "isRunningAgentLoop": false,
                        "description": "Review the account plan before Monday.",
                        "avatars": [{"name":"Dust","visual":"agent.png","isRounded":false}]
                      }],
                      "hasMore": false,
                      "lastValue": null,
                      "isEmpty": false
                    }
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))

        val response = repository.fetchSpaceConversations("w1", "space1", validTokenProvider())
        val projectConversation = response.conversations.single()

        assertEquals("https://dust.tt/api/w/w1/assistant/conversations/spaces/space1?limit=100", engine.requests.single().url)
        assertEquals("c1", projectConversation.id)
        assertEquals("Review the account plan before Monday.", projectConversation.description)
        assertEquals(4, projectConversation.replyCount)
        assertEquals(null, projectConversation.creator)
        assertEquals(true, projectConversation.asConversation().unread)
    }

    @Test
    fun `single message refresh requests the light response shape`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {
                      "message": {
                        "sId": "m1",
                        "type": "agent_message",
                        "created": 1700000000000,
                        "visibility": "visible",
                        "version": 0,
                        "rank": 2,
                        "status": "succeeded",
                        "content": "Done",
                        "configuration": {"sId":"a1","name":"Dust","pictureUrl":null},
                        "generatedFiles": [{"fileId":"f1","title":"report.csv","contentType":"text/csv"}],
                        "citations": {"ref_1":{"title":"Source","provider":"web","contentType":"text/html"}}
                      }
                    }
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))

        val message = repository.fetchMessage("w1", "c1", "m1", validTokenProvider())

        assertEquals("m1", message.id)
        assertEquals(
            "https://dust.tt/api/w/w1/assistant/conversations/c1/messages/m1?viewType=light",
            engine.requests.single().url,
        )
    }

    @Test
    fun `action validation uses the three-state private contract`() = runTest {
        val engine = FakeHttpEngine(HttpResponse(statusCode = 200))
        val repository = ConversationRepository(ApiClient(AppConfig.production(), engine))

        repository.validateAction(
            workspaceId = "w1",
            conversationId = "c1",
            messageId = "m1",
            actionId = "a1",
            approved = ActionApproval.ALWAYS_APPROVED,
            tokenProvider = validTokenProvider(),
        )

        val request = engine.requests.single()
        assertEquals(
            "https://dust.tt/api/w/w1/assistant/conversations/c1/messages/m1/validate-action",
            request.url,
        )
        assertEquals("""{"actionId":"a1","approved":"always_approved"}""", request.body?.decodeToString())
    }

    @Test
    fun `conversation attachments exclude server-hidden items`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {
                      "attachments": [
                        {"fileId":"f1","title":"visible.pdf","contentType":"application/pdf","source":"agent","hidden":false},
                        {"fileId":"f2","title":"internal.json","contentType":"application/json","source":"agent","hidden":true}
                      ]
                    }
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = FileRepository(ApiClient(AppConfig.production(), engine))

        val attachments = repository.fetchAttachments("w1", "c1", validTokenProvider())

        assertEquals(listOf("f1"), attachments.map { it.fileId })
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

private fun validTokenProvider(): TokenProvider = TokenProvider(
    accessToken = "token",
    refreshToken = "refresh",
    authApi = object : AuthApi {
        override suspend fun refreshTokens(refreshToken: String): AuthResponse =
            authResponse(accessToken = "new", refreshToken = "new-refresh")
    },
    tokenStore = InMemoryTokenStore(),
)
