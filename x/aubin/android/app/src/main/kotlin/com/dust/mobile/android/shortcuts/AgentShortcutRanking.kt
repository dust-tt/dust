package com.dust.mobile.android.shortcuts

import com.dust.mobile.android.data.persistence.PersistedAgentTarget
import com.dust.mobile.core.model.LightAgentConfiguration

internal fun rankedShareAgents(
    workspaceId: String,
    agents: List<LightAgentConfiguration>,
    recentTargets: List<PersistedAgentTarget>,
    limit: Int,
): List<LightAgentConfiguration> {
    if (limit <= 0) return emptyList()
    val agentsById = agents.associateBy(LightAgentConfiguration::sId)
    val recent = recentTargets
        .asSequence()
        .filter { it.workspaceId == workspaceId }
        .sortedByDescending(PersistedAgentTarget::lastUsedAtEpochMillis)
        .mapNotNull { agentsById[it.agentId] }
        .distinctBy(LightAgentConfiguration::sId)
        .toList()
    val recentIds = recent.mapTo(mutableSetOf(), LightAgentConfiguration::sId)
    val favorites = agents.filter { it.userFavorite && it.sId !in recentIds }
    return (recent + favorites).take(limit)
}
