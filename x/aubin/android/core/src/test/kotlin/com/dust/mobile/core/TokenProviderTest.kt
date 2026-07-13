package com.dust.mobile.core

import com.dust.mobile.core.auth.AuthApi
import com.dust.mobile.core.auth.AuthError
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.auth.TokenStore
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.User
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class TokenProviderTest {
    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `cancelled waiter does not clear in-flight refresh`() = runTest {
        val refreshCalls = AtomicInteger(0)
        val refreshStarted = CompletableDeferred<Unit>()
        val finishRefresh = CompletableDeferred<Unit>()
        val provider = TokenProvider(
            accessToken = "old-token",
            refreshToken = "refresh-token",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse {
                    refreshCalls.incrementAndGet()
                    refreshStarted.complete(Unit)
                    finishRefresh.await()
                    return authResponse()
                }
            },
            tokenStore = TokenProviderTestTokenStore(),
            scope = backgroundScope,
        )

        val firstWaiter = launch {
            provider.refreshedAccessToken()
        }
        refreshStarted.await()
        firstWaiter.cancelAndJoin()

        val secondWaiter = async {
            provider.refreshedAccessToken()
        }
        runCurrent()

        assertEquals(1, refreshCalls.get())

        finishRefresh.complete(Unit)
        assertEquals("new-token", secondWaiter.await())
    }

    @Test
    fun `disabled token access refuses network-bound tokens`() = runTest {
        val refreshCalls = AtomicInteger(0)
        val tokenStore = TokenProviderTestTokenStore()
        val provider = TokenProvider(
            accessToken = "local-preview-access-token",
            refreshToken = "local-preview-refresh-token",
            authApi = object : AuthApi {
                override suspend fun refreshTokens(refreshToken: String): AuthResponse {
                    refreshCalls.incrementAndGet()
                    return authResponse()
                }
            },
            tokenStore = tokenStore,
            allowTokenAccess = false,
        )

        assertTokenUnavailable { provider.validAccessToken() }
        assertTokenUnavailable { provider.refreshedAccessToken() }
        assertEquals(0, refreshCalls.get())
        assertNull(tokenStore.saved)
    }
}

private suspend fun assertTokenUnavailable(block: suspend () -> Unit) {
    try {
        block()
        fail("Expected token access to be unavailable")
    } catch (error: AuthError) {
        assertEquals(AuthError.TokenUnavailable, error)
    }
}

private class TokenProviderTestTokenStore : TokenStore {
    var saved: AuthTokens? = null

    override fun loadTokens(): AuthTokens? = saved

    override fun saveTokens(response: AuthResponse) {
        saved = AuthTokens(response.accessToken, response.refreshToken)
    }

    override fun clearTokens() {
        saved = null
    }
}

private fun authResponse(): AuthResponse =
    AuthResponse(
        accessToken = "new-token",
        refreshToken = "new-refresh-token",
        user = User(id = "u1", email = "user@dust.tt"),
        expiresIn = 3600,
    )
