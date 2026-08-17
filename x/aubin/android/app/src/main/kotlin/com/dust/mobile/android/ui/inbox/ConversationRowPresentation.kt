package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.max

internal enum class ConversationRowStatus {
    ACTION_REQUIRED,
    ERROR,
    RUNNING,
    UNREAD,
    SCHEDULED,
    AUTOMATED,
    IDLE,
}

internal data class ConversationRowPresentation(
    val status: ConversationRowStatus,
    val context: String?,
    val updatedLabel: String,
) {
    val isEmphasized: Boolean
        get() = status == ConversationRowStatus.ACTION_REQUIRED ||
            status == ConversationRowStatus.ERROR ||
            status == ConversationRowStatus.UNREAD
}

internal fun conversationRowPresentation(
    conversation: Conversation,
    podName: String?,
    nowMs: Long = System.currentTimeMillis(),
    zoneId: ZoneId = ZoneId.systemDefault(),
): ConversationRowPresentation {
    val status = when {
        conversation.actionRequired -> ConversationRowStatus.ACTION_REQUIRED
        conversation.hasError -> ConversationRowStatus.ERROR
        conversation.isRunningAgentLoop -> ConversationRowStatus.RUNNING
        conversation.unread -> ConversationRowStatus.UNREAD
        conversation.nextWakeupAt != null -> ConversationRowStatus.SCHEDULED
        conversation.triggerId != null -> ConversationRowStatus.AUTOMATED
        else -> ConversationRowStatus.IDLE
    }
    val statusLabel = when (status) {
        ConversationRowStatus.ACTION_REQUIRED -> "Action required"
        ConversationRowStatus.ERROR -> "Needs review"
        ConversationRowStatus.RUNNING -> "Agent working"
        ConversationRowStatus.UNREAD -> "Unread"
        ConversationRowStatus.SCHEDULED -> scheduledLabel(
            wakeupAtMs = conversation.nextWakeupAt?.toLong() ?: nowMs,
            nowMs = nowMs,
            zoneId = zoneId,
        )
        ConversationRowStatus.AUTOMATED -> "Automated"
        ConversationRowStatus.IDLE -> null
    }
    return ConversationRowPresentation(
        status = status,
        context = listOfNotNull(statusLabel, podName).joinToString(" · ").ifBlank { null },
        updatedLabel = relativeConversationTime(conversation.effectiveEpochMs.toLong(), nowMs, zoneId),
    )
}

internal fun relativeConversationTime(
    timestampMs: Long,
    nowMs: Long,
    zoneId: ZoneId,
): String {
    val ageMs = max(0, nowMs - timestampMs)
    val minutes = ageMs / 60_000
    if (minutes < 1) return "Now"
    if (minutes < 60) return "${minutes}m"

    val hours = minutes / 60
    if (hours < 24) return "${hours}h"

    val date = Instant.ofEpochMilli(timestampMs).atZone(zoneId).toLocalDate()
    val today = Instant.ofEpochMilli(nowMs).atZone(zoneId).toLocalDate()
    if (date == today.minusDays(1)) return "Yesterday"
    return if (date.year == today.year) {
        date.format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))
    } else {
        date.format(DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.getDefault()))
    }
}

private fun scheduledLabel(
    wakeupAtMs: Long,
    nowMs: Long,
    zoneId: ZoneId,
): String {
    val wakeup = Instant.ofEpochMilli(wakeupAtMs).atZone(zoneId)
    val today = Instant.ofEpochMilli(nowMs).atZone(zoneId).toLocalDate()
    return when (wakeup.toLocalDate()) {
        today -> "Scheduled ${wakeup.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))}"
        today.plusDays(1) -> "Scheduled tomorrow"
        else -> "Scheduled ${wakeup.format(DateTimeFormatter.ofPattern("EEE", Locale.getDefault()))}"
    }
}
