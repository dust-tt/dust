package com.dust.mobile.android.widget

import com.dust.mobile.android.data.persistence.PersistedWidgetItem
import com.dust.mobile.android.data.persistence.PersistedWidgetSnapshot
import com.dust.mobile.android.notifications.DustNotificationPayload
import com.dust.mobile.android.notifications.DustNotificationType
import com.dust.mobile.core.model.Conversation

internal fun PersistedWidgetSnapshot.updatedFrom(
    workspaceId: String,
    workspaceName: String,
    conversations: List<Conversation>,
    nowEpochMillis: Long = System.currentTimeMillis(),
): PersistedWidgetSnapshot {
    val mentionedIds = items.filter(PersistedWidgetItem::mentioned).mapTo(mutableSetOf()) {
        it.conversationId
    }
    val nextItems = conversations
        .asSequence()
        .filter { it.unread || it.actionRequired }
        .map { conversation ->
            PersistedWidgetItem(
                conversationId = conversation.sId,
                title = conversation.title?.takeIf(String::isNotBlank) ?: "Untitled conversation",
                unread = conversation.unread,
                mentioned = conversation.unread && conversation.sId in mentionedIds,
                actionRequired = conversation.actionRequired,
                updatedAtEpochMillis = conversation.effectiveEpochMs.toLong(),
            )
        }
        .sortedWith(widgetItemComparator)
        .toList()
    return snapshotFromItems(workspaceId, workspaceName, nextItems, nowEpochMillis)
}

internal fun PersistedWidgetSnapshot.updatedFrom(
    payload: DustNotificationPayload,
    nowEpochMillis: Long = System.currentTimeMillis(),
): PersistedWidgetSnapshot {
    if (workspaceId != null && workspaceId != payload.workspaceId) return this
    val existing = items.find { it.conversationId == payload.conversationId }
    val item = PersistedWidgetItem(
        conversationId = payload.conversationId,
        title = payload.conversationTitle,
        unread = existing?.unread == true || payload.type == DustNotificationType.CONVERSATION_UNREAD,
        mentioned = existing?.mentioned == true || payload.isMention,
        actionRequired = existing?.actionRequired == true ||
            payload.type == DustNotificationType.MANUAL_ACTION_REQUIRED,
        updatedAtEpochMillis = payload.sentAtMillis,
    )
    val nextItems = (items.filterNot { it.conversationId == item.conversationId } + item)
        .sortedWith(widgetItemComparator)
    return snapshotFromItems(
        workspaceId = payload.workspaceId,
        workspaceName = workspaceName,
        items = nextItems,
        nowEpochMillis = nowEpochMillis,
    )
}

private fun snapshotFromItems(
    workspaceId: String,
    workspaceName: String?,
    items: List<PersistedWidgetItem>,
    nowEpochMillis: Long,
): PersistedWidgetSnapshot = PersistedWidgetSnapshot(
    workspaceId = workspaceId,
    workspaceName = workspaceName,
    unreadCount = items.count(PersistedWidgetItem::unread),
    mentionCount = items.count(PersistedWidgetItem::mentioned),
    actionRequiredCount = items.count(PersistedWidgetItem::actionRequired),
    items = items,
    updatedAtEpochMillis = nowEpochMillis,
)

private val widgetItemComparator = compareBy<PersistedWidgetItem> {
    when {
        it.actionRequired -> 0
        it.mentioned -> 1
        else -> 2
    }
}.thenByDescending(PersistedWidgetItem::updatedAtEpochMillis)
