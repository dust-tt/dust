package com.dust.mobile.core

import com.dust.mobile.core.model.replyCountLabel
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.filteredByTitleSearch
import com.dust.mobile.core.model.withUpdatedTitle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConversationDisplayTest {
    @Test
    fun `reply count label is hidden when there are no replies`() {
        assertNull(replyCountLabel(0))
    }

    @Test
    fun `reply count label pluralizes replies`() {
        assertEquals("1 reply", replyCountLabel(1))
        assertEquals("2 replies", replyCountLabel(2))
    }

    @Test
    fun `updated title replaces matching conversation title only`() {
        val conversations = listOf(
            conversation("c1", "Old title"),
            conversation("c2", "Other title"),
        )

        val updated = conversations.withUpdatedTitle("c1", "New title")

        assertEquals("New title", updated[0].title)
        assertEquals("Other title", updated[1].title)
    }

    @Test
    fun `updated title leaves list unchanged when conversation is absent`() {
        val conversations = listOf(conversation("c1", "Old title"))

        val updated = conversations.withUpdatedTitle("missing", "New title")

        assertEquals(conversations, updated)
    }

    @Test
    fun `title search is case insensitive and excludes untitled conversations`() {
        val conversations = listOf(
            conversation("c1", "Quarterly Planning"),
            conversation("c2", "Daily notes"),
            conversation("c3", null),
        )

        val filtered = conversations.filteredByTitleSearch("plan")

        assertEquals(listOf(conversations[0]), filtered)
    }

    @Test
    fun `title search treats whitespace as a real query`() {
        val conversations = listOf(
            conversation("c1", "One"),
            conversation("c2", "Two Words"),
        )

        val filtered = conversations.filteredByTitleSearch(" ")

        assertEquals(listOf(conversations[1]), filtered)
    }

    private fun conversation(id: String, title: String?): Conversation =
        Conversation(
            sId = id,
            created = 1.0,
            updated = 2.0,
            title = title,
            unread = false,
            actionRequired = false,
        )
}
