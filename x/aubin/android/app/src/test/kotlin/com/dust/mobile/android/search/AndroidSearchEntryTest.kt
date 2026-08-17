package com.dust.mobile.android.search

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.Space
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidSearchEntryTest {
    @Test
    fun `conversation entries are recent, bounded, and deep linked`() {
        val entries = conversationSearchEntries(
            workspaceId = "w1",
            conversations = (1..60).map { rank ->
                Conversation(
                    sId = "c$rank",
                    created = rank.toDouble(),
                    updated = rank.toDouble(),
                    title = "Conversation $rank",
                    unread = false,
                    actionRequired = false,
                )
            },
        )

        assertEquals(50, entries.size)
        assertEquals("Conversation 60", entries.first().title)
        assertEquals("dust://conversation/w1/c60", entries.first().deepLink)
        assertTrue(entries.all { it.namespace == "w1:content" })
    }

    @Test
    fun `agents and pods have exact Android destinations`() {
        val agent = agentSearchEntries(
            "workspace id",
            listOf(
                LightAgentConfiguration(
                    sId = "agent/one",
                    name = "Research",
                    description = "Finds relevant workspace context",
                    scope = "global",
                    userFavorite = true,
                ),
            ),
        ).single()
        val pod = podSearchEntries(
            "w1",
            listOf(Space(sId = "p1", name = "Launch", kind = "project")),
        ).single()

        assertEquals(
            "dust://compose?workspaceId=workspace+id&agentId=agent%2Fone",
            agent.deepLink,
        )
        assertEquals("dust://pod/w1/p1", pod.deepLink)
        assertTrue(agent.score > pod.score)
    }
}
