package com.dust.mobile.core

import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.optimisticUserMessage
import org.junit.Assert.assertEquals
import org.junit.Test

class OptimisticMessagesTest {
    @Test
    fun `optimistic user message uses pending id and next rank`() {
        val message = optimisticUserMessage(
            content = "On it",
            user = User(id = "u1", email = "ada@example.com"),
            messages = listOf(userMessage("u1", rank = 3)),
            sId = "pending-test",
            createdEpochMs = 42.0,
        )

        assertEquals("pending-test", message.id)
        assertEquals(4, message.rank)
        assertEquals(42.0, message.created, 0.0)
        assertEquals(MessageType.USER, message.message.type)
        assertEquals("visible", message.message.visibility)
        assertEquals("On it", message.message.content)
        assertEquals("ada@example.com", message.message.context?.email)
    }

    @Test
    fun `optimistic user message starts rank at one`() {
        val message = optimisticUserMessage(
            content = "First",
            user = User(id = "u1", email = "ada@example.com"),
            messages = emptyList(),
            sId = "pending-first",
            createdEpochMs = 1.0,
        )

        assertEquals(1, message.rank)
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
                content = "message $rank",
            ),
        )
}
