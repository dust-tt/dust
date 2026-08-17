package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import kotlinx.serialization.Serializable

class MobileNotificationRepository(
    private val apiClient: ApiClient,
) {
    suspend fun register(token: String, tokenProvider: TokenProvider) {
        apiClient.authenticatedPost<MobileNotificationTokenRequest, MobileNotificationTokenResponse>(
            Endpoints.MOBILE_NOTIFICATION_TOKENS,
            MobileNotificationTokenRequest(token),
            tokenProvider,
        )
    }

    suspend fun unregister(token: String, tokenProvider: TokenProvider) {
        apiClient.authenticatedSend(
            Endpoints.MOBILE_NOTIFICATION_TOKENS,
            HttpMethod.DELETE,
            MobileNotificationTokenRequest(token),
            tokenProvider,
        )
    }
}

@Serializable
private data class MobileNotificationTokenRequest(val token: String)

@Serializable
private data class MobileNotificationTokenResponse(val success: Boolean)
