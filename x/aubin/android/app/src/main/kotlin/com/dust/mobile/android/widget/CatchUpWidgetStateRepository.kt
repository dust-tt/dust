package com.dust.mobile.android.widget

import com.dust.mobile.android.data.persistence.PersistedWidgetSnapshot
import com.dust.mobile.android.data.persistence.PersistedStateStore
import com.dust.mobile.android.notifications.DustNotificationPayload
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Workspace

internal class CatchUpWidgetStateRepository(
    private val stateStore: PersistedStateStore,
) {
    suspend fun configure(appWidgetId: Int, workspace: Workspace) {
        stateStore.update { state ->
            val snapshot = state.widgetSnapshots[workspace.sId]
                ?: PersistedWidgetSnapshot(workspaceId = workspace.sId, workspaceName = workspace.name)
            state.copy(
                widgetWorkspaceIds = state.widgetWorkspaceIds + (appWidgetId to workspace.sId),
                widgetSnapshots = state.widgetSnapshots + (workspace.sId to snapshot),
            )
        }
    }

    suspend fun remove(appWidgetId: Int) {
        stateStore.update { state ->
            val widgetWorkspaceIds = state.widgetWorkspaceIds - appWidgetId
            val retainedWorkspaceIds = widgetWorkspaceIds.values.toSet()
            state.copy(
                widgetWorkspaceIds = widgetWorkspaceIds,
                widgetSnapshots = state.widgetSnapshots.filterKeys { it in retainedWorkspaceIds },
            )
        }
    }

    suspend fun updateFromConversations(
        workspace: Workspace,
        conversations: List<Conversation>,
        nowEpochMillis: Long = System.currentTimeMillis(),
    ) {
        stateStore.update { state ->
            val previous = state.widgetSnapshots[workspace.sId] ?: PersistedWidgetSnapshot()
            state.copy(
                widgetSnapshots = state.widgetSnapshots + (
                    workspace.sId to previous.updatedFrom(
                        workspaceId = workspace.sId,
                        workspaceName = workspace.name,
                        conversations = conversations,
                        nowEpochMillis = nowEpochMillis,
                    )
                    ),
            )
        }
    }

    suspend fun applyNotification(payload: DustNotificationPayload) {
        stateStore.update { state ->
            val listensToWorkspace = payload.workspaceId in state.widgetWorkspaceIds.values ||
                (state.widgetWorkspaceIds.isEmpty() && state.selectedWorkspaceId == payload.workspaceId)
            if (!listensToWorkspace) return@update state
            val previous = state.widgetSnapshots[payload.workspaceId]
                ?: PersistedWidgetSnapshot(workspaceId = payload.workspaceId)
            state.copy(
                widgetSnapshots = state.widgetSnapshots + (
                    payload.workspaceId to previous.updatedFrom(payload)
                    ),
            )
        }
    }
}
