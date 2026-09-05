package com.dust.mobile.android.ui.inbox

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.sortAgentsForPicker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

internal class ConversationListPlatformController(
    private val graph: AppGraph,
    private val state: StateFlow<ConversationListState>,
    private val scope: CoroutineScope,
    private val isLocalPreview: Boolean,
    private val tokenProvider: TokenProvider,
) {
    fun syncWidget(workspaceId: String) {
        if (isLocalPreview) return
        val current = state.value
        val workspace = current.workspace?.takeIf { it.sId == workspaceId } ?: return
        graph.catchUpWidgetController.updateFromConversations(workspace, current.conversations)
    }

    fun persistWorkspace(workspaceId: String) {
        scope.launch {
            graph.persistedStateStore.update { it.copy(selectedWorkspaceId = workspaceId) }
        }
    }

    fun prefetchAgents(workspaceId: String) {
        if (isLocalPreview) return
        scope.launch {
            runCatching {
                graph.agentRepository.fetchAgents(workspaceId, tokenProvider)
                    .let(::sortAgentsForPicker)
            }.onSuccess { agents ->
                runCatching { graph.agentShortcutPublisher.publish(workspaceId, agents) }
                runCatching {
                    graph.appSearchIndexer.indexAgents(
                        workspaceId = workspaceId,
                        agents = agents,
                        displayedBySystem = graph.persistedStateStore.current().systemSearchEnabled,
                    )
                }
            }
        }
    }
}
