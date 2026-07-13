package com.dust.mobile.core.auth

import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.network.ApiError
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TokenProvider(
    accessToken: String,
    refreshToken: String,
    expiresAtEpochSeconds: Long? = null,
    private val authApi: AuthApi,
    private val tokenStore: TokenStore,
    private val onSessionExpired: () -> Unit = {},
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val nowEpochSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
    private val allowTokenAccess: Boolean = true,
) {
    private val mutex = Mutex()
    private var accessToken: String = accessToken
    private var refreshToken: String = refreshToken
    private var expiresAtEpochSeconds: Long? = expiresAtEpochSeconds
    private var refreshFailed = false
    private var activeRefresh: Deferred<String>? = null

    suspend fun validAccessToken(): String {
        requireTokenAccess()
        val shouldRefresh = mutex.withLock {
            expiresAtEpochSeconds?.let { nowEpochSeconds() >= it } == true
        }
        return if (shouldRefresh) refreshedAccessToken() else mutex.withLock { accessToken }
    }

    suspend fun refreshedAccessToken(): String {
        requireTokenAccess()
        val deferred = mutex.withLock {
            if (refreshFailed) {
                onSessionExpired()
                throw AuthError.SessionExpired
            }
            activeRefresh ?: scope.async(start = CoroutineStart.LAZY) {
                refresh(currentRefreshToken = refreshToken)
            }.also { deferred ->
                activeRefresh = deferred
                deferred.invokeOnCompletion {
                    scope.launch {
                        mutex.withLock {
                            if (activeRefresh == deferred) {
                                activeRefresh = null
                            }
                        }
                    }
                }
                deferred.start()
            }
        }

        return deferred.await()
    }

    private suspend fun refresh(currentRefreshToken: String): String {
        return try {
            val response = authApi.refreshTokens(currentRefreshToken)
            saveResponse(response)
            response.accessToken
        } catch (error: ApiError.Http) {
            if (error.statusCode in 400..499) {
                mutex.withLock { refreshFailed = true }
                onSessionExpired()
            }
            throw error
        }
    }

    private suspend fun saveResponse(response: AuthResponse) {
        mutex.withLock {
            accessToken = response.accessToken
            refreshToken = response.refreshToken
            expiresAtEpochSeconds = response.expiresIn?.let { nowEpochSeconds() + it }
        }
        tokenStore.saveTokens(response)
    }

    private fun requireTokenAccess() {
        if (!allowTokenAccess) {
            throw AuthError.TokenUnavailable
        }
    }
}
