package com.dust.mobile.core

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.loadConversationListData
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationListRefreshTest {
    @Test
    fun `pod failures do not block conversation refresh`() = runTest {
        val data = loadConversationListData(
            fetchConversations = { listOf(conversation("c1")) },
            fetchPods = { error("pods failed") },
        )

        assertEquals(listOf(conversation("c1")), data.conversations)
        assertTrue(data.pods.isEmpty())
    }

    @Test
    fun `conversation failures still fail refresh`() = runTest {
        val result = runCatching {
            loadConversationListData(
                fetchConversations = { error("conversations failed") },
                fetchPods = { listOf(space("sp1")) },
            )
        }

        assertTrue(result.isFailure)
        assertEquals("conversations failed", result.exceptionOrNull()?.message)
    }

    private fun conversation(id: String): Conversation =
        Conversation(
            sId = id,
            created = 1.0,
            updated = 2.0,
            title = "Conversation $id",
            unread = false,
            actionRequired = false,
        )

    private fun space(id: String): Space =
        Space(
            sId = id,
            name = "Pod $id",
            kind = "project",
        )
}
