package com.dust.mobile.android.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DustNotificationPayloadTest {
    @Test
    fun `parses a conversation notification and builds its exact deep link`() {
        val payload = DustNotificationPayload.fromData(
            mapOf(
                DustNotificationPayload.KEY_TYPE to "conversation_unread",
                DustNotificationPayload.KEY_WORKSPACE_ID to "w1",
                DustNotificationPayload.KEY_CONVERSATION_ID to "c1",
                DustNotificationPayload.KEY_MESSAGE_ID to "m1",
                DustNotificationPayload.KEY_CONVERSATION_TITLE to "Quarterly planning",
                DustNotificationPayload.KEY_AUTHOR_NAME to "Ada",
                DustNotificationPayload.KEY_AUTHOR_USER_ID to "u1",
                DustNotificationPayload.KEY_AUTHOR_IS_AGENT to "false",
                DustNotificationPayload.KEY_IS_MENTION to "true",
                DustNotificationPayload.KEY_TITLE to "Quarterly planning",
                DustNotificationPayload.KEY_BODY to "Ada: Can you review this?",
            ),
            sentAtMillis = 123L,
        )

        requireNotNull(payload)
        assertEquals(DustNotificationType.CONVERSATION_UNREAD, payload.type)
        assertEquals(true, payload.isMention)
        assertEquals(true, payload.usesHumanConversationSemantics)
        assertEquals(listOf(NotificationActionKind.REPLY), payload.actionKinds)
        assertEquals("dust://conversation/w1/c1?messageId=m1", payload.deepLink("dust"))
        assertEquals(NotificationChannels.MENTIONS, NotificationChannels.forPayload(payload))
    }

    @Test
    fun `routes manual actions to the action channel`() {
        val payload = DustNotificationPayload.fromData(
            mapOf(
                DustNotificationPayload.KEY_TYPE to "manual_action_required",
                DustNotificationPayload.KEY_WORKSPACE_ID to "w1",
                DustNotificationPayload.KEY_CONVERSATION_ID to "c1",
                DustNotificationPayload.KEY_TITLE to "Action required",
                DustNotificationPayload.KEY_BODY to "An agent is waiting for approval.",
            ),
        )

        requireNotNull(payload)
        assertEquals(NotificationChannels.ACTIONS, NotificationChannels.forPayload(payload))
        assertEquals(false, payload.usesHumanConversationSemantics)
        assertEquals(listOf(NotificationActionKind.REVIEW), payload.actionKinds)
    }

    @Test
    fun `rejects incomplete notification data`() {
        assertNull(
            DustNotificationPayload.fromData(
                mapOf(
                    DustNotificationPayload.KEY_TYPE to "conversation_unread",
                    DustNotificationPayload.KEY_WORKSPACE_ID to "w1",
                ),
            ),
        )
    }

    @Test
    fun `does not treat an unidentified non agent sender as a system conversation`() {
        val payload = DustNotificationPayload.fromData(
            mapOf(
                DustNotificationPayload.KEY_TYPE to "conversation_unread",
                DustNotificationPayload.KEY_WORKSPACE_ID to "w1",
                DustNotificationPayload.KEY_CONVERSATION_ID to "c1",
                DustNotificationPayload.KEY_AUTHOR_IS_AGENT to "false",
                DustNotificationPayload.KEY_TITLE to "Update",
                DustNotificationPayload.KEY_BODY to "A file changed",
            ),
        )

        requireNotNull(payload)
        assertEquals(false, payload.usesHumanConversationSemantics)
    }
}
