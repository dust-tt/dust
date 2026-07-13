package com.dust.mobile.core.model

fun filterAgents(
    agents: List<LightAgentConfiguration>,
    query: String,
): List<LightAgentConfiguration> {
    if (query.isEmpty()) return agents
    val normalizedQuery = query.lowercase()

    return agents.filter { agent ->
        agent.name.contains(normalizedQuery, ignoreCase = true) ||
            agent.description.contains(normalizedQuery, ignoreCase = true)
    }
}

fun sortAgentsForPicker(agents: List<LightAgentConfiguration>): List<LightAgentConfiguration> =
    agents.sortedWith(
        compareByDescending<LightAgentConfiguration> { it.userFavorite }
            .thenBy { it.name.lowercase() }
            .thenBy { it.name },
    )
