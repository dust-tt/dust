package com.dust.mobile.android.shortcuts

import com.dust.mobile.android.data.persistence.PersistedAgentTarget
import com.dust.mobile.core.model.LightAgentConfiguration
import org.junit.Assert.assertEquals
import org.junit.Test

class AgentShortcutRankingTest {
    @Test
    fun `ranks recent agents before remaining favorites`() {
        val agents = listOf(
            agent("favorite", favorite = true),
            agent("recent"),
            agent("older", favorite = true),
        )
        val recent = listOf(
            target("workspace", "older", 10),
            target("workspace", "recent", 20),
            target("other", "favorite", 30),
        )

        assertEquals(
            listOf("recent", "older", "favorite"),
            rankedShareAgents("workspace", agents, recent, limit = 3).map { it.sId },
        )
    }

    @Test
    fun `drops stale agents and respects target limit`() {
        val agents = listOf(agent("favorite", favorite = true), agent("recent"))
        val recent = listOf(target("workspace", "missing", 30), target("workspace", "recent", 20))

        assertEquals(
            listOf("recent"),
            rankedShareAgents("workspace", agents, recent, limit = 1).map { it.sId },
        )
    }

    private fun agent(id: String, favorite: Boolean = false) = LightAgentConfiguration(
        sId = id,
        name = id,
        description = "",
        scope = "workspace",
        userFavorite = favorite,
    )

    private fun target(workspaceId: String, agentId: String, usedAt: Long) = PersistedAgentTarget(
        workspaceId = workspaceId,
        agentId = agentId,
        name = agentId,
        lastUsedAtEpochMillis = usedAt,
    )
}
