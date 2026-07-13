package com.dust.mobile.android.data

import android.content.Context
import com.dust.mobile.android.BuildConfig
import com.dust.mobile.android.auth.AndroidTokenStore
import com.dust.mobile.core.auth.AuthService
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.OkHttpEngine
import com.dust.mobile.core.network.SseClient
import com.dust.mobile.core.repository.AgentRepository
import com.dust.mobile.core.repository.CapabilityRepository
import com.dust.mobile.core.repository.ConversationRepository
import com.dust.mobile.core.repository.FileRepository
import com.dust.mobile.core.repository.SpaceRepository
import com.dust.mobile.core.repository.TranscriptionRepository
import com.dust.mobile.core.repository.UserRepository

class AppGraph(context: Context) {
    val appContext: Context = context.applicationContext

    val config: AppConfig = AppConfig(
        apiBaseUrl = BuildConfig.DUST_API_BASE_URL,
        appUrl = BuildConfig.DUST_APP_URL,
    )
    val localAuthBypassEnabled: Boolean = BuildConfig.LOCAL_AUTH_BYPASS_ENABLED
    val localAuthBypassButtonEnabled: Boolean = BuildConfig.LOCAL_AUTH_BYPASS_BUTTON_ENABLED

    val tokenStore = AndroidTokenStore(appContext)
    val apiClient = ApiClient(config = config, engine = OkHttpEngine())
    val sseClient = SseClient(config = config)
    val authService = AuthService(config = config, apiClient = apiClient)
    val userRepository = UserRepository(apiClient)
    val conversationRepository = ConversationRepository(apiClient)
    val agentRepository = AgentRepository(apiClient)
    val capabilityRepository = CapabilityRepository(apiClient)
    val spaceRepository = SpaceRepository(apiClient)
    val fileRepository = FileRepository(apiClient)
    val transcriptionRepository = TranscriptionRepository(apiClient)

    fun tokenProvider(tokens: AuthTokens, onSessionExpired: () -> Unit): TokenProvider =
        TokenProvider(
            accessToken = tokens.accessToken,
            refreshToken = tokens.refreshToken,
            authApi = authService,
            tokenStore = tokenStore,
            onSessionExpired = onSessionExpired,
        )

    fun tokenProvider(response: AuthResponse, onSessionExpired: () -> Unit): TokenProvider =
        TokenProvider(
            accessToken = response.accessToken,
            refreshToken = response.refreshToken,
            expiresAtEpochSeconds = response.expiresIn?.let { System.currentTimeMillis() / 1000 + it },
            authApi = authService,
            tokenStore = tokenStore,
            onSessionExpired = onSessionExpired,
        )

    fun localPreviewTokenProvider(onSessionExpired: () -> Unit): TokenProvider =
        TokenProvider(
            accessToken = "local-preview-access-token",
            refreshToken = "local-preview-refresh-token",
            authApi = authService,
            tokenStore = tokenStore,
            onSessionExpired = onSessionExpired,
            allowTokenAccess = false,
        )
}
