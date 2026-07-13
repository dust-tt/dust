package com.dust.mobile.core

import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.replyAgentConfigurationId
import com.dust.mobile.core.model.retargetReplyAgentForMessages
import org.junit.Assert.assertEquals
import org.junit.Test

class ReplyAgentsTest {
    @Test
    fun `replyAgentConfigurationId uses the latest agent message configuration`() {
        val messages = listOf(
            userMessage("u1", rank = 1),
            agentMessage("a1", rank = 2, agentId = "research"),
            userMessage("u2", rank = 3),
            agentMessage("a2", rank = 4, agentId = "support"),
        )

        assertEquals("support", replyAgentConfigurationId(messages))
    }

    @Test
    fun `replyAgentConfigurationId falls back to dust when there is no agent message`() {
        val messages = listOf(userMessage("u1", rank = 1))

        assertEquals("dust", replyAgentConfigurationId(messages))
    }

    @Test
    fun `retargetReplyAgentForMessages follows newly latest agent message`() {
        val research = lightAgent("research")
        val support = lightAgent("support")
        val previousMessages = listOf(agentMessage("a1", rank = 1, agentId = "research"))
        val nextMessages = previousMessages + agentMessage("a2", rank = 2, agentId = "support")

        assertEquals(
            support,
            retargetReplyAgentForMessages(
                previousMessages = previousMessages,
                nextMessages = nextMessages,
                agents = listOf(research, support),
                selectedAgent = research,
            ),
        )
    }

    @Test
    fun `retargetReplyAgentForMessages preserves manual selection when latest agent is unchanged`() {
        val research = lightAgent("research")
        val manual = lightAgent("manual")
        val previousMessages = listOf(agentMessage("a1", rank = 1, agentId = "research"))
        val nextMessages = previousMessages + userMessage("u1", rank = 2)

        assertEquals(
            manual,
            retargetReplyAgentForMessages(
                previousMessages = previousMessages,
                nextMessages = nextMessages,
                agents = listOf(research, manual),
                selectedAgent = manual,
            ),
        )
    }

    private fun userMessage(sId: String, rank: Int): ConversationMessage.User =
        ConversationMessage.User(
            UserMessage(
                id = rank,
                sId = sId,
                type = MessageType.USER,
                created = rank.toDouble(),
                visibility = "visible",
                version = 0,
                rank = rank,
                content = "hello",
            ),
        )

    private fun agentMessage(sId: String, rank: Int, agentId: String): ConversationMessage.Agent =
        ConversationMessage.Agent(
            AgentMessage(
                sId = sId,
                type = MessageType.AGENT,
                created = rank.toDouble(),
                visibility = "visible",
                version = 0,
                rank = rank,
                status = AgentMessageStatus.SUCCEEDED,
                configuration = AgentConfiguration(sId = agentId, name = agentId),
            ),
        )

    private fun lightAgent(sId: String): LightAgentConfiguration =
        LightAgentConfiguration(
            sId = sId,
            name = sId,
            description = "",
            scope = "workspace",
        )
}
