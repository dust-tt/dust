package com.dust.mobile.android.data.outbox

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class OutboxDeliveryRecoveryTest {
    @Test
    fun `an interrupted send requires review instead of automatic redelivery`() {
        val item = item(PersistedOutboxStatus.SENDING)
        val recovered = item.recoverInterruptedDelivery()
        assertEquals(PersistedOutboxStatus.FAILED, recovered.status)
        assertEquals(item.displayText, recovered.displayText)
        assertNotNull(recovered.lastError)
    }

    @Test
    fun `queued work can still send and confirmed results stay available`() {
        for (status in listOf(PersistedOutboxStatus.PENDING, PersistedOutboxStatus.SENT, PersistedOutboxStatus.FAILED)) {
            val item = item(status)
            assertEquals(item, item.recoverInterruptedDelivery())
        }
    }

    private fun item(status: PersistedOutboxStatus) = PersistedOutboxItem(
        id = "local-request", kind = PersistedOutboxKind.POST_MESSAGE, workspaceId = "workspace",
        status = status, displayText = "Keep this draft", createdAtEpochMillis = 1L,
    )
}
