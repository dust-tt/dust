package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.PodTaskStatus
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import com.dust.mobile.core.network.HttpResponse
import com.dust.mobile.core.repository.PodRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class PodRepositoryTest {
    @Test
    fun `pod details decode the rich space contract`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {
                      "space": {
                        "sId": "p1",
                        "name": "Customer Ops",
                        "kind": "project",
                        "description": "Account preparation",
                        "isRestricted": true,
                        "canWrite": true,
                        "canRead": true,
                        "isMember": true,
                        "isEditor": true,
                        "members": [{
                          "sId": "u1",
                          "fullName": "Lea Martin",
                          "email": "lea@dust.tt",
                          "image": null,
                          "isEditor": true,
                          "unknownUserField": "ignored"
                        }],
                        "todoGenerationEnabled": true,
                        "pinnedFramePath": "pod-p1/brief.frame",
                        "categories": {}
                      }
                    }
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = PodRepository(ApiClient(AppConfig.production(), engine))

        val pod = repository.fetchDetails("w1", "p1", podTokenProvider())

        assertEquals("Customer Ops", pod.name)
        assertEquals(true, pod.isEditor)
        assertEquals("Lea Martin", pod.members.single().fullName)
        assertEquals("pod-p1/brief.frame", pod.pinnedFramePath)
        assertEquals(
            "https://dust.tt/api/w/w1/spaces/p1?includeAllMembers=true",
            engine.requests.single().url,
        )
    }

    @Test
    fun `pod files preserve directory and frame variants`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {"files":[
                      {"fileName":"Research","path":"pod-p1/Research","sizeBytes":0,"lastModifiedMs":1,"isDirectory":true},
                      {"fileName":"brief.frame","path":"pod-p1/brief.frame","sizeBytes":42,"lastModifiedMs":2,"isDirectory":false,"contentType":"application/vnd.dust.frame","fileId":"f1","thumbnailUrl":null}
                    ]}
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = PodRepository(ApiClient(AppConfig.production(), engine))

        val files = repository.fetchFiles("w1", "p1", podTokenProvider())

        assertEquals(true, files[0].isDirectory)
        assertEquals(true, files[1].isFrame)
        assertEquals("f1", files[1].fileId)
    }

    @Test
    fun `pod tasks use the canonical filter query and status enum`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(
                statusCode = 200,
                body = """
                    {"tasks":[{"sId":"t1","text":"Review brief","status":"in_progress","user":null}],"lastReadAt":null,"viewerUserId":"u1"}
                """.trimIndent().encodeToByteArray(),
            ),
        )
        val repository = PodRepository(ApiClient(AppConfig.production(), engine))

        val tasks = repository.fetchTasks("w1", "p1", PodTaskFilter.OPEN, podTokenProvider())

        assertEquals(PodTaskStatus.IN_PROGRESS, tasks.single().status)
        assertEquals(
            "https://dust.tt/api/w/w1/spaces/p1/project_tasks?period=active&people=all",
            engine.requests.single().url,
        )
    }

    @Test
    fun `pod mutations send the private API contracts exactly`() = runTest {
        val engine = FakeHttpEngine(
            HttpResponse(statusCode = 200, body = """{"task":{"sId":"t1","text":"Review brief","status":"todo"}}""".encodeToByteArray()),
            HttpResponse(statusCode = 200),
            HttpResponse(statusCode = 200),
            HttpResponse(statusCode = 200),
            HttpResponse(statusCode = 200),
        )
        val repository = PodRepository(ApiClient(AppConfig.production(), engine))
        val tokenProvider = podTokenProvider()

        repository.createTask("w1", "p1", "Review brief", tokenProvider)
        repository.updateTaskStatus("w1", "p1", "t1", PodTaskStatus.DONE, tokenProvider)
        repository.updateNotificationPreference(
            "w1",
            "p1",
            PodNotificationCondition.ONLY_MENTIONS,
            tokenProvider,
        )
        repository.updatePinnedFrame("w1", "p1", "pod-p1/brief.frame", tokenProvider)
        repository.updateTaskSuggestions("w1", "p1", true, tokenProvider)

        assertEquals(HttpMethod.POST, engine.requests[0].method)
        assertEquals("{\"text\":\"Review brief\"}", engine.requests[0].body?.decodeToString())
        assertEquals(HttpMethod.PATCH, engine.requests[1].method)
        assertEquals("{\"status\":\"done\"}", engine.requests[1].body?.decodeToString())
        assertEquals("{\"preference\":\"only_mentions\"}", engine.requests[2].body?.decodeToString())
        assertEquals("{\"pinnedFramePath\":\"pod-p1/brief.frame\"}", engine.requests[3].body?.decodeToString())
        assertEquals("{\"todoGenerationEnabled\":true}", engine.requests[4].body?.decodeToString())
    }
}

private class PodTokenStore : TokenStore {
    override fun loadTokens(): AuthTokens? = null
    override fun saveTokens(response: AuthResponse) = Unit
    override fun clearTokens() = Unit
}

private fun podTokenProvider(): TokenProvider = TokenProvider(
    accessToken = "token",
    refreshToken = "refresh",
    authApi = object : AuthApi {
        override suspend fun refreshTokens(refreshToken: String): AuthResponse =
            AuthResponse(
                accessToken = "new",
                refreshToken = "new-refresh",
                user = User(id = "u1", email = "lea@dust.tt"),
            )
    },
    tokenStore = PodTokenStore(),
)
