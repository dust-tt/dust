package com.dust.mobile.android.data.outbox

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus

internal fun List<PersistedOutboxItem>.retainingUnacknowledgedMessages(): List<PersistedOutboxItem> {
    // Conversation sends are acknowledged by their screen after restoring the result.
    // Notification replies have no screen owner, so only their delivered history expires.
    val retainedNotificationIds = asSequence()
        .filter { it.isDeliveredNotificationReply }
        .map { it.id }
        .toList()
        .takeLast(MAX_RETAINED_NOTIFICATION_REPLIES)
        .toSet()
    return filter { !it.isDeliveredNotificationReply || it.id in retainedNotificationIds }
}

private val PersistedOutboxItem.isDeliveredNotificationReply: Boolean
    get() = kind == PersistedOutboxKind.NOTIFICATION_REPLY && status == PersistedOutboxStatus.SENT

private const val MAX_RETAINED_NOTIFICATION_REPLIES = 50
