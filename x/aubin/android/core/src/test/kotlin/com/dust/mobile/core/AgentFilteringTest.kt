package com.dust.mobile.core

import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.filterAgents
import com.dust.mobile.core.model.sortAgentsForPicker
import org.junit.Assert.assertEquals
import org.junit.Test

class AgentFilteringTest {
    @Test
    fun `empty queries return all agents`() {
        val agents = listOf(agent("research"), agent("sales"))

        assertEquals(agents, filterAgents(agents, ""))
    }

    @Test
    fun `whitespace queries are treated as real search text`() {
        val agents = listOf(agent("research"), agent("sales"))

        assertEquals(emptyList<LightAgentConfiguration>(), filterAgents(agents, " "))
    }

    @Test
    fun `filters agents by name or description case insensitively`() {
        val research = agent("Research", "Finds market context")
        val sales = agent("Sales", "Handles pipeline")
        val support = agent("Support", "Resolves customer issues")
        val agents = listOf(research, sales, support)

        assertEquals(listOf(research), filterAgents(agents, "research"))
        assertEquals(listOf(sales), filterAgents(agents, "PIPE"))
    }

    @Test
    fun `sorts picker agents by favorite then case insensitive name`() {
        val beta = agent("Beta")
        val alpha = agent("alpha")
        val favoriteZed = agent("zed", userFavorite = true)
        val favoriteAda = agent("Ada", userFavorite = true)

        assertEquals(
            listOf(favoriteAda, favoriteZed, alpha, beta),
            sortAgentsForPicker(listOf(beta, alpha, favoriteZed, favoriteAda)),
        )
    }

    private fun agent(
        name: String,
        description: String = "",
        userFavorite: Boolean = false,
    ) = LightAgentConfiguration(
        sId = "agent-$name",
        name = name,
        description = description,
        scope = "global",
        userFavorite = userFavorite,
    )
}
