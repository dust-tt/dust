package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.replyAgentConfigurationId
import com.dust.mobile.core.model.sortAgentsForPicker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ConversationReplyOptionsLoader(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val isLocalPreview: Boolean,
    private val coroutineScope: CoroutineScope,
    private val state: MutableStateFlow<ConversationDetailState>,
) {
    fun load(messages: List<ConversationMessage>) {
        if (isLocalPreview) return
        loadAgents(messages)
        loadCapabilities()
    }

    private fun loadAgents(messages: List<ConversationMessage>) {
        coroutineScope.launch {
            val currentAgentId = replyAgentConfigurationId(messages)
            graph.agentRepository.peekCachedAgents(workspaceId)
                ?.let(::sortAgentsForPicker)
                ?.let { updateAgents(it, currentAgentId) }
            runCatching {
                graph.agentRepository.fetchAgents(workspaceId, tokenProvider)
                    .let(::sortAgentsForPicker)
            }.onSuccess { agents ->
                updateAgents(agents, currentAgentId)
            }
        }
    }

    private fun updateAgents(agents: List<LightAgentConfiguration>, currentAgentId: String) {
        state.update { current ->
            current.copy(
                agents = agents,
                selectedReplyAgent = current.selectedReplyAgent
                    ?.let { selected -> agents.firstOrNull { it.sId == selected.sId } }
                    ?: agents.firstOrNull { it.sId == currentAgentId }
                    ?: agents.firstOrNull { it.sId == DEFAULT_AGENT_CONFIGURATION_ID }
                    ?: agents.firstOrNull(),
            )
        }
    }

    private fun loadCapabilities() {
        coroutineScope.launch {
            state.update { it.copy(isLoadingSkills = true) }
            runCatching {
                val skills = async {
                    graph.capabilityRepository.fetchSkills(workspaceId, tokenProvider).also { loadedSkills ->
                        state.update { current ->
                            current.copy(
                                availableCapabilities = (
                                    current.availableCapabilities.filterNot {
                                        it is Capability.SkillCapability
                                    } + loadedSkills.map { Capability.SkillCapability(it) }
                                    ).sortedBy { it.sortKey },
                                isLoadingSkills = false,
                            )
                        }
                    }
                }
                val spaces = graph.spaceRepository.fetchGlobalSpaces(workspaceId, tokenProvider)
                val tools = graph.capabilityRepository.fetchMcpServerViews(
                    workspaceId = workspaceId,
                    spaceIds = spaces.map { it.sId },
                    tokenProvider = tokenProvider,
                )
                (tools.map { Capability.Tool(it) } +
                    skills.await().map { Capability.SkillCapability(it) })
                    .sortedBy { it.sortKey }
            }.onSuccess { capabilities ->
                state.update {
                    it.copy(
                        availableCapabilities = capabilities,
                        isLoadingSkills = false,
                    )
                }
            }.onFailure {
                state.update { it.copy(isLoadingSkills = false) }
            }
        }
    }
}
