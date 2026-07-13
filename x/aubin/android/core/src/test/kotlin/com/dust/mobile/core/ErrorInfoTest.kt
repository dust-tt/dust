package com.dust.mobile.core

import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.StreamingError
import com.dust.mobile.core.model.StreamingErrorMetadata
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorInfoTest {
    @Test
    fun `retryable categories can be retried`() {
        listOf("retryable_model_error", "stream_error", "empty_content").forEach { category ->
            val error = ErrorInfo.from(
                StreamingError(
                    message = "Generation failed",
                    metadata = StreamingErrorMetadata(category = category),
                ),
                messageId = "msg_123",
            )

            assertTrue(error.isRetryable)
        }
    }

    @Test
    fun `non retryable categories are not retried`() {
        val error = ErrorInfo.from(
            StreamingError(
                message = "Context window exceeded",
                metadata = StreamingErrorMetadata(category = "context_window_exceeded"),
            ),
            messageId = "msg_123",
        )

        assertFalse(error.isRetryable)
    }
}
