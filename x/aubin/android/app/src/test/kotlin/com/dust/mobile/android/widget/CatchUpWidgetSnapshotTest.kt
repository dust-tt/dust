package com.dust.mobile.android.widget

import com.dust.mobile.android.data.persistence.PersistedWidgetItem
import com.dust.mobile.android.data.persistence.PersistedWidgetSnapshot
import com.dust.mobile.android.notifications.DustNotificationPayload
import com.dust.mobile.android.notifications.DustNotificationType
import com.dust.mobile.core.model.Conversation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatchUpWidgetSnapshotTest {
    @Test
    fun `conversation refresh preserves unread mentions and orders priority`() {
        val previous = PersistedWidgetSnapshot(
            workspaceId = "w1",
            items = listOf(item("mention", mentioned = true)),
        )

        val snapshot = previous.updatedFrom(
            workspaceId = "w1",
            workspaceName = "Dust",
            conversations = listOf(
                conversation("unread", unread = true, updated = 30.0),
                conversation("mention", unread = true, updated = 10.0),
                conversation("action", actionRequired = true, updated = 20.0),
                conversation("read", updated = 40.0),
            ),
            nowEpochMillis = 50,
        )

        assertEquals(listOf("action", "mention", "unread"), snapshot.items.map { it.conversationId })
        assertEquals(2, snapshot.unreadCount)
        assertEquals(1, snapshot.mentionCount)
        assertEquals(1, snapshot.actionRequiredCount)
    }

    @Test
    fun `refresh clears mention once conversation is read`() {
        val previous = PersistedWidgetSnapshot(
            workspaceId = "w1",
            items = listOf(item("mention", mentioned = true)),
        )

        val snapshot = previous.updatedFrom("w1", "Dust", listOf(conversation("mention")), 50)

        assertTrue(snapshot.items.isEmpty())
        assertEquals(0, snapshot.mentionCount)
    }

    @Test
    fun `notification immediately upserts the matching workspace`() {
        val snapshot = PersistedWidgetSnapshot(workspaceId = "w1", workspaceName = "Dust").updatedFrom(
            payload = notification(isMention = true),
            nowEpochMillis = 60,
        )

        assertEquals(1, snapshot.unreadCount)
        assertEquals(1, snapshot.mentionCount)
        assertFalse(snapshot.items.single().actionRequired)
    }

    @Test
    fun `notification for another workspace does not leak into snapshot`() {
        val snapshot = PersistedWidgetSnapshot(workspaceId = "w2")

        assertEquals(snapshot, snapshot.updatedFrom(notification(), nowEpochMillis = 60))
    }

    private fun conversation(
        id: String,
        unread: Boolean = false,
        actionRequired: Boolean = false,
        updated: Double = 1.0,
    ) = Conversation(
        sId = id,
        created = 1.0,
        updated = updated,
        title = id,
        unread = unread,
        actionRequired = actionRequired,
    )

    private fun item(id: String, mentioned: Boolean = false) = PersistedWidgetItem(
        conversationId = id,
        title = id,
        unread = true,
        mentioned = mentioned,
        actionRequired = false,
        updatedAtEpochMillis = 1,
    )

    private fun notification(isMention: Boolean = false) = DustNotificationPayload(
        type = DustNotificationType.CONVERSATION_UNREAD,
        workspaceId = "w1",
        conversationId = "c1",
        messageId = "m1",
        actionId = null,
        conversationTitle = "Quarterly plan",
        authorName = "Ada",
        authorIsAgent = false,
        isMention = isMention,
        title = "Ada",
        body = "Please review",
        sentAtMillis = 55,
    )
}
