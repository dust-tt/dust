package com.dust.mobile.android.widget

import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.collection.intSetOf
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.dust.mobile.android.BuildConfig
import com.dust.mobile.android.data.persistence.PersistedStateStore
import com.dust.mobile.android.notifications.DustNotificationPayload
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.repository.ConversationRepository
import com.dust.mobile.core.repository.UserRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal class CatchUpWidgetController(
    private val context: Context,
    private val stateStore: PersistedStateStore,
    private val conversationRepository: ConversationRepository,
    private val userRepository: UserRepository,
) {
    private val stateRepository = CatchUpWidgetStateRepository(stateStore)
    private val workManager = WorkManager.getInstance(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun schedulePeriodicRefresh() {
        val request = PeriodicWorkRequestBuilder<CatchUpWidgetWorker>(
            PERIODIC_REFRESH_MINUTES,
            TimeUnit.MINUTES,
            PERIODIC_FLEX_MINUTES,
            TimeUnit.MINUTES,
        ).setConstraints(networkConstraints()).build()
        workManager.enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun requestRefresh() {
        val request = OneTimeWorkRequestBuilder<CatchUpWidgetWorker>()
            .setConstraints(networkConstraints())
            .build()
        workManager.enqueueUniqueWork(REFRESH_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancelScheduledRefresh() {
        workManager.cancelUniqueWork(PERIODIC_WORK_NAME)
        workManager.cancelUniqueWork(REFRESH_WORK_NAME)
    }

    fun updateFromConversations(workspace: Workspace, conversations: List<Conversation>) {
        scope.launch {
            stateRepository.updateFromConversations(workspace, conversations)
            CatchUpWidget().updateAll(context)
        }
    }

    fun onNotification(payload: DustNotificationPayload) {
        scope.launch {
            stateRepository.applyNotification(payload)
            CatchUpWidget().updateAll(context)
        }
    }

    suspend fun configure(appWidgetId: Int, workspace: Workspace) {
        stateRepository.configure(appWidgetId, workspace)
    }

    suspend fun remove(appWidgetId: Int) {
        stateRepository.remove(appWidgetId)
    }

    suspend fun refreshFromNetwork(tokenProvider: TokenProvider) {
        val state = stateStore.current()
        val configuredIds = state.widgetWorkspaceIds.values.toSet()
        if (configuredIds.isEmpty()) {
            CatchUpWidget().updateAll(context)
            return
        }
        val user = userRepository.fetchDustUser(tokenProvider)
        user.workspaces
            .filter { it.sId in configuredIds }
            .forEach { workspace ->
                val conversations = conversationRepository
                    .fetchConversations(workspace.sId, tokenProvider)
                    .conversations
                stateRepository.updateFromConversations(workspace, conversations)
            }
        CatchUpWidget().updateAll(context)
    }

    fun updateLoggedOutWidgets() {
        scope.launch { CatchUpWidget().updateAll(context) }
    }

    fun publishGeneratedPreview() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return
        val preferences = context.getSharedPreferences(PREVIEW_PREFS_NAME, Context.MODE_PRIVATE)
        if (preferences.getInt(PREVIEW_VERSION_KEY, 0) == BuildConfig.VERSION_CODE) return
        scope.launch {
            runCatching {
                GlanceAppWidgetManager(context).setWidgetPreviews(
                    receiver = CatchUpWidgetReceiver::class,
                    widgetCategories = intSetOf(AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN),
                )
            }.onSuccess { result ->
                if (result == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS) {
                    preferences.edit().putInt(PREVIEW_VERSION_KEY, BuildConfig.VERSION_CODE).apply()
                }
            }.onFailure { error ->
                Log.w(TAG, "Failed to publish Catch Up widget preview", error)
            }
        }
    }

    private fun networkConstraints(): Constraints =
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    private companion object {
        const val TAG = "DustCatchUpWidget"
        const val PERIODIC_WORK_NAME = "dust-catch-up-widget-periodic"
        const val REFRESH_WORK_NAME = "dust-catch-up-widget-refresh"
        const val PERIODIC_REFRESH_MINUTES = 30L
        const val PERIODIC_FLEX_MINUTES = 10L
        const val PREVIEW_PREFS_NAME = "dust_widget_preview"
        const val PREVIEW_VERSION_KEY = "published_version"
    }
}
