package com.dust.mobile.android.data.offline

import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OfflineCacheModelsTest {
    @Test
    fun `switching users clears previous cached content`() {
        val firstUser = user("user-1")
        val secondUser = user("user-2")
        val state = OfflineCacheState()
            .forActiveUser(firstUser)
            .withWorkspace(
                activeUser = firstUser,
                workspaceId = "w1",
                conversations = listOf(conversation("c1")),
                pods = listOf(Space("p1", "Launch", "project")),
                updatedAtEpochMillis = 1L,
            )
            .forActiveUser(secondUser)

        assertEquals(secondUser, state.activeUser)
        assertEquals(emptyList<CachedWorkspace>(), state.workspaces)
        assertEquals(emptyList<CachedConversation>(), state.conversations)
        assertNull(state.dustUser)
    }

    @Test
    fun `conversation cache keeps forty recent messages and a usable older cursor`() {
        val user = user("user-1")
        val messages = (1..50).map(::agentMessage)

        val cached = OfflineCacheState(activeUser = user)
            .withConversation(
                activeUser = user,
                workspaceId = "w1",
                conversationId = "c1",
                messages = messages,
                hasMore = false,
                updatedAtEpochMillis = 10L,
            )
            .conversations
            .single()

        assertEquals(40, cached.messages.size)
        assertEquals(11, cached.messages.first().rank)
        assertEquals(50, cached.messages.last().rank)
        assertEquals(true, cached.hasMore)
        assertEquals(11, cached.lastValue)
    }

    @Test
    fun `offline state round trips polymorphic conversation messages`() {
        val user = user("user-1")
        val state = OfflineCacheState(activeUser = user).withConversation(
            activeUser = user,
            workspaceId = "w1",
            conversationId = "c1",
            messages = listOf(agentMessage(1)),
            hasMore = false,
            updatedAtEpochMillis = 10L,
        )

        val restored = DustJson.decodeFromString<OfflineCacheState>(DustJson.encodeToString(state))

        assertEquals(state, restored)
    }

    private fun user(id: String) = User(id = id, email = "$id@dust.tt")

    private fun conversation(id: String) = Conversation(
        sId = id,
        created = 1.0,
        updated = 1.0,
        title = id,
        unread = false,
        actionRequired = false,
    )

    private fun agentMessage(rank: Int) = ConversationMessage.Agent(
        AgentMessage(
            sId = "a$rank",
            type = MessageType.AGENT,
            created = rank.toDouble(),
            visibility = "visible",
            version = 0,
            rank = rank,
            status = AgentMessageStatus.SUCCEEDED,
            content = "Response $rank",
            configuration = AgentConfiguration(sId = "dust", name = "Dust"),
        ),
    )
}
