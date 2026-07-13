package com.dust.mobile.core.stream

data class ReconnectDelay(
    val delayMs: Long,
    val nextRetryDelayMs: Long,
)

class StreamEventCursor {
    private val seenEventIds = mutableSetOf<String>()
    var lastEventId: String? = null
        private set

    fun shouldProcess(eventId: String): Boolean {
        if (eventId.isBlank()) return true
        if (!seenEventIds.add(eventId)) return false
        lastEventId = eventId
        return true
    }
}

object StreamingReconnect {
    const val INITIAL_RETRY_DELAY_MS = 1_000L
    const val MAX_RETRY_DELAY_MS = 30_000L
    const val CLEAN_RECONNECT_DELAY_MS = 250L

    fun nextDelay(shouldBackOff: Boolean, retryDelayMs: Long): ReconnectDelay =
        if (shouldBackOff) {
            ReconnectDelay(
                delayMs = retryDelayMs,
                nextRetryDelayMs = (retryDelayMs * 2).coerceAtMost(MAX_RETRY_DELAY_MS),
            )
        } else {
            ReconnectDelay(
                delayMs = CLEAN_RECONNECT_DELAY_MS,
                nextRetryDelayMs = INITIAL_RETRY_DELAY_MS,
            )
        }
}
