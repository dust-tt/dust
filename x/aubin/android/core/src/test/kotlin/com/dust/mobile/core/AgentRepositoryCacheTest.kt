package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpEngine
import com.dust.mobile.core.network.HttpRequest
import com.dust.mobile.core.network.HttpResponse
import com.dust.mobile.core.repository.AgentRepository
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test

class AgentRepositoryCacheTest {
    @Test
    fun `successive agent loads reuse the workspace cache`() = runTest {
        val engine = FakeHttpEngine(agentResponse(), agentResponse())
        val repository = AgentRepository(ApiClient(AppConfig.production(), engine))

        val first = repository.fetchAgents("w1", tokenProvider())
        val second = repository.fetchAgents("w1", tokenProvider())

        assertEquals(first, second)
        assertEquals(1, engine.requests.size)
        assertEquals(first, repository.peekCachedAgents("w1"))

        repository.clearCache()
        repository.fetchAgents("w1", tokenProvider())

        assertEquals(2, engine.requests.size)
    }

    @Test
    fun `concurrent agent loads share one request`() = runTest {
        val requestStarted = CompletableDeferred<Unit>()
        val releaseRequest = CompletableDeferred<Unit>()
        val requestCount = AtomicInteger()
        val engine = object : HttpEngine {
            override suspend fun execute(request: HttpRequest): HttpResponse {
                requestCount.incrementAndGet()
                requestStarted.complete(Unit)
                releaseRequest.await()
                return agentResponse()
            }
        }
        val repository = AgentRepository(ApiClient(AppConfig.production(), engine))
        val provider = tokenProvider()

        val first = async { repository.fetchAgents("w1", provider) }
        requestStarted.await()
        val second = async { repository.fetchAgents("w1", provider) }
        yield()
        releaseRequest.complete(Unit)

        assertEquals(first.await(), second.await())
        assertEquals(1, requestCount.get())
    }

    private fun agentResponse() = HttpResponse(
        statusCode = 200,
        body = """
            {
              "agentConfigurations": [
                {
                  "sId": "dust",
                  "name": "Dust",
                  "description": "General assistant",
                  "scope": "workspace",
                  "userFavorite": true
                }
              ]
            }
        """.trimIndent().encodeToByteArray(),
    )

    private fun tokenProvider() = TokenProvider(
        accessToken = "token",
        refreshToken = "refresh",
        authApi = object : AuthApi {
            override suspend fun refreshTokens(refreshToken: String) = AuthResponse(
                accessToken = "new-token",
                refreshToken = "new-refresh",
                user = User(id = "u1", email = "user@dust.tt"),
            )
        },
        tokenStore = object : TokenStore {
            override fun loadTokens(): AuthTokens? = null
            override fun saveTokens(response: AuthResponse) = Unit
            override fun clearTokens() = Unit
        },
    )
}
