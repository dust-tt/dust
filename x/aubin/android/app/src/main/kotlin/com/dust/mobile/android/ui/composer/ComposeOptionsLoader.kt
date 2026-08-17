package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewAgents
import com.dust.mobile.android.ui.preview.localPreviewCapabilities
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.sortAgentsForPicker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ComposeOptionsLoader(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val isLocalPreview: Boolean,
    private val coroutineScope: CoroutineScope,
    private val state: MutableStateFlow<ComposeState>,
) {
    fun load() {
        if (isLocalPreview) {
            val agents = localPreviewAgents()
            state.update {
                it.copy(
                    agents = agents,
                    selectedAgent = agents.firstOrNull(),
                    availableCapabilities = localPreviewCapabilities(workspaceId),
                    isLoadingOptions = false,
                )
            }
            return
        }

        coroutineScope.launch {
            state.update { it.copy(isLoadingOptions = true, isLoadingSkills = true) }
            graph.agentRepository.peekCachedAgents(workspaceId)
                ?.let(::sortAgentsForPicker)
                ?.let(::updateAgents)
            runCatching {
                val agents = async {
                    sortAgentsForPicker(graph.agentRepository.fetchAgents(workspaceId, tokenProvider))
                }
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
                val spaces = async {
                    graph.spaceRepository.fetchGlobalSpaces(workspaceId, tokenProvider)
                }
                val resolvedAgents = agents.await()
                val globalSpaces = spaces.await()
                val tools = graph.capabilityRepository.fetchMcpServerViews(
                    workspaceId = workspaceId,
                    spaceIds = globalSpaces.map { it.sId },
                    tokenProvider = tokenProvider,
                )
                val capabilities = tools.map { Capability.Tool(it) } +
                    skills.await().map { Capability.SkillCapability(it) }
                resolvedAgents to capabilities.sortedBy { it.sortKey }
            }.onSuccess { (agents, capabilities) ->
                state.update {
                    it.copy(
                        agents = agents,
                        selectedAgent = selectedAgent(agents, it.selectedAgent?.sId),
                        availableCapabilities = capabilities,
                        isLoadingOptions = false,
                        isLoadingSkills = false,
                    )
                }
                runCatching { graph.agentShortcutPublisher.publish(workspaceId, agents) }
                runCatching {
                    graph.appSearchIndexer.indexAgents(
                        workspaceId = workspaceId,
                        agents = agents,
                        displayedBySystem = graph.persistedStateStore.current().systemSearchEnabled,
                    )
                }
            }.onFailure { error ->
                state.update {
                    it.copy(
                        isLoadingOptions = false,
                        isLoadingSkills = false,
                        error = error.message ?: "Failed to load input options",
                    )
                }
            }
        }
    }

    private fun updateAgents(agents: List<LightAgentConfiguration>) {
        state.update { current ->
            current.copy(
                agents = agents,
                selectedAgent = selectedAgent(agents, current.selectedAgent?.sId),
            )
        }
    }

    private fun selectedAgent(
        agents: List<LightAgentConfiguration>,
        selectedAgentId: String?,
    ) = agents.firstOrNull { it.sId == selectedAgentId }
        ?: agents.firstOrNull { it.sId == DEFAULT_AGENT_CONFIGURATION_ID }
        ?: agents.firstOrNull()
}
