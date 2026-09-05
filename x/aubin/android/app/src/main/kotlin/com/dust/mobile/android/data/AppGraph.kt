package com.dust.mobile.android.data

import android.content.Context
import com.dust.mobile.android.BuildConfig
import com.dust.mobile.android.auth.AndroidTokenStore
import com.dust.mobile.android.data.offline.OfflineCacheRepository
import com.dust.mobile.android.data.offline.OfflineCacheStore
import com.dust.mobile.android.data.outbox.OutboxRepository
import com.dust.mobile.android.data.persistence.PersistedStateStore
import com.dust.mobile.android.notifications.ConversationNotificationShortcutPublisher
import com.dust.mobile.android.search.DustAppSearchIndexer
import com.dust.mobile.android.shortcuts.AgentShortcutPublisher
import com.dust.mobile.android.widget.CatchUpWidgetController
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
import com.dust.mobile.core.repository.PodRepository
import com.dust.mobile.core.repository.SpaceRepository
import com.dust.mobile.core.repository.TranscriptionRepository
import com.dust.mobile.core.repository.UserRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AppGraph(context: Context) {
    val appContext: Context = context.applicationContext
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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
    val podRepository = PodRepository(apiClient)
    val transcriptionRepository = TranscriptionRepository(apiClient)
    internal val persistedStateStore = PersistedStateStore(appContext)
    internal val offlineCacheRepository = OfflineCacheRepository(OfflineCacheStore(appContext))
    internal val agentShortcutPublisher = AgentShortcutPublisher(appContext, persistedStateStore)
    internal val appSearchIndexer = DustAppSearchIndexer(appContext)
    private val conversationNotificationShortcuts = ConversationNotificationShortcutPublisher(appContext)
    internal val catchUpWidgetController = CatchUpWidgetController(
        context = appContext,
        stateStore = persistedStateStore,
        conversationRepository = conversationRepository,
        userRepository = userRepository,
    )
    internal val outboxRepository = OutboxRepository(
        context = appContext,
        stateStore = persistedStateStore,
        conversationRepository = conversationRepository,
        fileRepository = fileRepository,
        userRepository = userRepository,
    )

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

    fun clearPersistedSession() {
        outboxRepository.cancelScheduledWork()
        agentShortcutPublisher.clear()
        conversationNotificationShortcuts.clear()
        catchUpWidgetController.cancelScheduledRefresh()
        applicationScope.launch {
            agentRepository.clearCache()
            runCatching { appSearchIndexer.clear() }
            persistedStateStore.clear()
            offlineCacheRepository.clear()
            catchUpWidgetController.updateLoggedOutWidgets()
        }
    }
}
