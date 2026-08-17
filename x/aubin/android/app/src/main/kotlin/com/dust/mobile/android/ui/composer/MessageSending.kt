package com.dust.mobile.android.ui.composer

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.selectedToolIds
import java.net.SocketTimeoutException
import java.time.ZoneId
import kotlinx.coroutines.TimeoutCancellationException

internal const val MESSAGE_SEND_TIMEOUT_MS = 45_000L
internal const val MESSAGE_SEND_LOG_TAG = "DustMessageSend"
internal const val MESSAGE_SEND_TIMEOUT_NOTICE =
    "Sending timed out. Check the conversation before trying again."

internal fun messageSendError(error: Throwable, fallback: String): String {
    val timedOut = generateSequence(error) { it.cause }
        .any { it is TimeoutCancellationException || it is SocketTimeoutException }
    return if (timedOut) MESSAGE_SEND_TIMEOUT_NOTICE else error.message ?: fallback
}

internal fun restoredReplyDraft(sentDraft: String, currentDraft: String): String = when {
    sentDraft.isBlank() -> currentDraft
    currentDraft.isBlank() -> sentDraft
    else -> "$sentDraft\n\n$currentDraft"
}

internal fun buildMessageContext(capabilities: List<Capability>, profilePictureUrl: String?): MessageContext {
    val toolIds = selectedToolIds(capabilities)
    return MessageContext(
        timezone = ZoneId.systemDefault().id,
        profilePictureUrl = profilePictureUrl,
        selectedMCPServerViewIds = toolIds.ifEmpty { null },
    )
}
