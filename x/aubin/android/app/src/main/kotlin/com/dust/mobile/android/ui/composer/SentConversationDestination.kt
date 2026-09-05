package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.core.model.Conversation

internal fun PersistedOutboxItem.sentConversationDestination(): Conversation? {
    val conversationId = resultConversationId ?: return null
    if (status != PersistedOutboxStatus.SENT) return null
    return Conversation(
        sId = conversationId,
        created = createdAtEpochMillis.toDouble(),
        updated = createdAtEpochMillis.toDouble(),
        unread = false,
        actionRequired = false,
        spaceId = createRequest?.spaceId,
    )
}
