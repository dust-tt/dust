package com.dust.mobile.android.ui.composer

import com.dust.mobile.core.network.ApiError
import java.net.SocketTimeoutException
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageSendErrorTest {
    @Test
    fun `network timeout has an actionable send error`() {
        val error = ApiError.Network(SocketTimeoutException("timeout"))

        assertEquals(
            MESSAGE_SEND_TIMEOUT_NOTICE,
            messageSendError(error, "Failed to send"),
        )
    }

    @Test
    fun `non-timeout send error keeps its message`() {
        assertEquals(
            "Connection refused",
            messageSendError(IllegalStateException("Connection refused"), "Failed to send"),
        )
    }

    @Test
    fun `failed reply restores sent text without dropping a new draft`() {
        assertEquals("First message", restoredReplyDraft("First message", ""))
        assertEquals("Next message", restoredReplyDraft("", "Next message"))
        assertEquals(
            "First message\n\nNext message",
            restoredReplyDraft("First message", "Next message"),
        )
    }
}
