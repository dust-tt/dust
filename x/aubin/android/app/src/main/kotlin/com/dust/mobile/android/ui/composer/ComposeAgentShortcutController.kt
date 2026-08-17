package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.removeActiveAgentMentionQuery
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ComposeAgentShortcutController(
    private val graph: AppGraph,
    private val workspaceId: String,
    private val state: MutableStateFlow<ComposeState>,
    private val coroutineScope: CoroutineScope,
) {
    fun select(agent: LightAgentConfiguration) {
        setSelected(agent)
        record(agent)
    }

    suspend fun prefer(agentId: String?, shortcutId: String?) {
        if (agentId == null) return
        val readyState = state
            .filter { it.isDraftRestored && !it.isLoadingOptions }
            .first()
        val agent = readyState.agents.find { it.sId == agentId } ?: return
        setSelected(agent)
        runCatching {
            graph.agentShortcutPublisher.recordAgent(
                workspaceId = workspaceId,
                agent = agent,
                availableAgents = readyState.agents,
                shortcutId = shortcutId,
            )
        }
    }

    fun record(agent: LightAgentConfiguration) {
        val availableAgents = state.value.agents
        coroutineScope.launch {
            runCatching {
                graph.agentShortcutPublisher.recordAgent(workspaceId, agent, availableAgents)
            }
        }
    }

    private fun setSelected(agent: LightAgentConfiguration) {
        state.update {
            it.copy(
                text = removeActiveAgentMentionQuery(it.text),
                selectedAgent = agent,
            )
        }
    }
}
