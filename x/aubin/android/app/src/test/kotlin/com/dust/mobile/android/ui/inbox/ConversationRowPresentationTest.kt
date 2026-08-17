package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class ConversationRowPresentationTest {
    @Test
    fun `action required takes precedence and includes pod context`() {
        val presentation = conversationRowPresentation(
            conversation = conversation(
                updated = NOW_MS - 12 * 60_000,
                actionRequired = true,
                hasError = true,
                isRunning = true,
                unread = true,
            ),
            podName = "Customer Ops",
            nowMs = NOW_MS,
            zoneId = UTC,
        )

        assertEquals(ConversationRowStatus.ACTION_REQUIRED, presentation.status)
        assertEquals("Action required · Customer Ops", presentation.context)
        assertEquals("12m", presentation.updatedLabel)
        assertEquals(true, presentation.isEmphasized)
    }

    @Test
    fun `running work takes precedence over unread`() {
        val presentation = conversationRowPresentation(
            conversation = conversation(isRunning = true, unread = true),
            podName = null,
            nowMs = NOW_MS,
            zoneId = UTC,
        )

        assertEquals(ConversationRowStatus.RUNNING, presentation.status)
        assertEquals("Agent working", presentation.context)
        assertEquals(false, presentation.isEmphasized)
    }

    @Test
    fun `scheduled work describes a next-day wakeup`() {
        val presentation = conversationRowPresentation(
            conversation = conversation(nextWakeupAt = NOW_MS + 24 * 60 * 60_000),
            podName = "General",
            nowMs = NOW_MS,
            zoneId = UTC,
        )

        assertEquals(ConversationRowStatus.SCHEDULED, presentation.status)
        assertEquals("Scheduled tomorrow · General", presentation.context)
    }

    @Test
    fun `relative labels remain compact`() {
        assertEquals("Now", relativeConversationTime(NOW_MS - 20_000, NOW_MS, UTC))
        assertEquals("18m", relativeConversationTime(NOW_MS - 18 * 60_000, NOW_MS, UTC))
        assertEquals("3h", relativeConversationTime(NOW_MS - 3 * 60 * 60_000, NOW_MS, UTC))
        assertEquals("Yesterday", relativeConversationTime(NOW_MS - 24 * 60 * 60_000, NOW_MS, UTC))
    }

    private fun conversation(
        updated: Long = NOW_MS,
        actionRequired: Boolean = false,
        hasError: Boolean = false,
        isRunning: Boolean = false,
        unread: Boolean = false,
        nextWakeupAt: Long? = null,
    ): Conversation = Conversation(
        sId = "conversation",
        created = updated.toDouble(),
        updated = updated.toDouble(),
        title = "Conversation",
        unread = unread,
        actionRequired = actionRequired,
        hasError = hasError,
        isRunningAgentLoop = isRunning,
        nextWakeupAt = nextWakeupAt?.toDouble(),
    )

    private companion object {
        val UTC: ZoneId = ZoneId.of("UTC")
        val NOW_MS: Long = Instant.parse("2026-07-28T10:00:00Z").toEpochMilli()
    }
}
