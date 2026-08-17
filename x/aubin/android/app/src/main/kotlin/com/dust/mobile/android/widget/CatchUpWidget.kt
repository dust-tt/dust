package com.dust.mobile.android.widget

import android.content.Context
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.PreviewSizeMode
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import com.dust.mobile.android.DustApplication
import com.dust.mobile.android.data.persistence.PersistedWidgetItem
import com.dust.mobile.android.data.persistence.PersistedWidgetSnapshot

internal class CatchUpWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact
    override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(
        setOf(
            DpSize(180.dp, 110.dp),
            DpSize(280.dp, 170.dp),
            DpSize(320.dp, 260.dp),
        ),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val graph = (context.applicationContext as DustApplication).graph
        val state = graph.persistedStateStore.current()
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        val workspaceId = state.widgetWorkspaceIds[appWidgetId] ?: state.selectedWorkspaceId
        val renderState = CatchUpWidgetRenderState(
            appWidgetId = appWidgetId,
            isAuthenticated = graph.tokenStore.loadTokens() != null,
            snapshot = workspaceId?.let(state.widgetSnapshots::get),
        )
        provideContent { CatchUpWidgetContent(context, renderState) }
    }

    override suspend fun providePreview(context: Context, widgetCategory: Int) {
        provideContent {
            CatchUpWidgetContent(
                context = context,
                state = CatchUpWidgetRenderState(
                    appWidgetId = null,
                    isAuthenticated = true,
                    snapshot = catchUpWidgetPreviewSnapshot,
                ),
            )
        }
    }

    override suspend fun onDelete(context: Context, glanceId: GlanceId) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
        (context.applicationContext as DustApplication).graph.catchUpWidgetController.remove(appWidgetId)
    }

}

internal val catchUpWidgetPreviewSnapshot = PersistedWidgetSnapshot(
    workspaceId = "preview",
    workspaceName = "Customer Operations",
    unreadCount = 7,
    mentionCount = 2,
    actionRequiredCount = 1,
    items = listOf(
        PersistedWidgetItem(
            conversationId = "c1",
            title = "Review the Q3 customer briefing",
            unread = true,
            mentioned = false,
            actionRequired = true,
            updatedAtEpochMillis = 3,
        ),
        PersistedWidgetItem(
            conversationId = "c2",
            title = "Prepare launch follow-ups",
            unread = true,
            mentioned = true,
            actionRequired = false,
            updatedAtEpochMillis = 2,
        ),
        PersistedWidgetItem(
            conversationId = "c3",
            title = "Summarize workspace changes",
            unread = true,
            mentioned = false,
            actionRequired = false,
            updatedAtEpochMillis = 1,
        ),
    ),
    updatedAtEpochMillis = 3,
)

internal data class CatchUpWidgetRenderState(
    val appWidgetId: Int?,
    val isAuthenticated: Boolean,
    val snapshot: PersistedWidgetSnapshot?,
)

class CatchUpWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CatchUpWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        val controller = (context.applicationContext as DustApplication).graph.catchUpWidgetController
        controller.schedulePeriodicRefresh()
        controller.requestRefresh()
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        (context.applicationContext as DustApplication).graph.catchUpWidgetController.cancelScheduledRefresh()
    }
}
