package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.SseClient
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test

class SseClientTest {
    @Test
    fun `event stream stops when done event has trailing space`() = runTest {
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """
                        data: {"eventId":"1"}
                        data: done${" "}
                        data: {"eventId":"ignored"}
                        """.trimIndent().toResponseBody("text/event-stream".toMediaType()),
                    )
                    .build()
            }
            .build()
        val client = SseClient(config = AppConfig.production(), client = okHttpClient)

        val payloads = client.eventStream("/events", testTokenProvider()).toList()

        assertEquals(listOf("""{"eventId":"1"}"""), payloads)
    }

    @Test
    fun `event stream preserves non-space whitespace payloads`() = runTest {
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """
                        data: ${"\t"}
                        data: done
                        """.trimIndent().toResponseBody("text/event-stream".toMediaType()),
                    )
                    .build()
            }
            .build()
        val client = SseClient(config = AppConfig.production(), client = okHttpClient)

        val payloads = client.eventStream("/events", testTokenProvider()).toList()

        assertEquals(listOf("\t"), payloads)
    }

    @Test
    fun `cancelling collection cancels in-flight OkHttp call`() = runTest {
        val requestStarted = CompletableDeferred<Unit>()
        val cancellationObserved = CompletableDeferred<Unit>()
        val okHttpClient = OkHttpClient.Builder()
            .readTimeout(1, TimeUnit.HOURS)
            .addInterceptor { chain ->
                requestStarted.complete(Unit)
                while (!chain.call().isCanceled()) {
                    Thread.sleep(10)
                }
                cancellationObserved.complete(Unit)
                throw IOException("Call cancelled")
            }
            .build()
        val client = SseClient(config = AppConfig.production(), client = okHttpClient)
        val provider = testTokenProvider()

        val job = launch(Dispatchers.Default) {
            try {
                client.eventStream("/events", provider).collect()
            } catch (error: CancellationException) {
                throw error
            } catch (_: IOException) {
                // The interceptor throws once the underlying call has observed cancellation.
            }
        }

        withContext(Dispatchers.Default) {
            withTimeout(1_000) { requestStarted.await() }
        }
        job.cancel()

        withContext(Dispatchers.Default) {
            withTimeout(1_000) { cancellationObserved.await() }
        }
        job.cancelAndJoin()
    }
}

private fun testTokenProvider() = TokenProvider(
    accessToken = "token",
    refreshToken = "refresh",
    authApi = object : AuthApi {
        override suspend fun refreshTokens(refreshToken: String): AuthResponse =
            AuthResponse(
                accessToken = "new-token",
                refreshToken = "new-refresh",
                user = User(id = "u1", email = "user@dust.tt"),
                expiresIn = 3600,
            )
    },
    tokenStore = object : TokenStore {
        override fun loadTokens(): AuthTokens? = null
        override fun saveTokens(response: AuthResponse) = Unit
        override fun clearTokens() = Unit
    },
)
