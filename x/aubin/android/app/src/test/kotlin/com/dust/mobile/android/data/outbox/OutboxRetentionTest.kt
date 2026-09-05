package com.dust.mobile.android.data.outbox

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OutboxRetentionTest {
    @Test
    fun `retention preserves every unsent message and unacknowledged conversation result`() {
        val pending = (1..60).map { item("pending-$it", PersistedOutboxStatus.PENDING) }
        val failed = item("failed", PersistedOutboxStatus.FAILED)
        val sending = item("sending", PersistedOutboxStatus.SENDING)
        val awaitingNavigation = item("sent", PersistedOutboxStatus.SENT)
            .copy(kind = PersistedOutboxKind.CREATE_CONVERSATION)
        val deliveredNotifications = (1..60).map { item("delivered-$it", PersistedOutboxStatus.SENT) }

        val retained = (pending + failed + sending + awaitingNavigation + deliveredNotifications)
            .retainingUnacknowledgedMessages()

        assertTrue(retained.containsAll(pending + failed + sending + awaitingNavigation))
        assertEquals(deliveredNotifications.takeLast(50), retained.filter { it.id.startsWith("delivered-") })
        assertEquals(113, retained.size)
    }

    private fun item(id: String, status: PersistedOutboxStatus) = PersistedOutboxItem(
        id = id,
        kind = PersistedOutboxKind.NOTIFICATION_REPLY,
        workspaceId = "workspace",
        status = status,
        createdAtEpochMillis = 1L,
    )
}
