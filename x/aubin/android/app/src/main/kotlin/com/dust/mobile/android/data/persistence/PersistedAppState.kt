package com.dust.mobile.android.data.persistence

import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.KnowledgeItem
import kotlinx.serialization.Serializable

@Serializable
internal data class PersistedAppState(
    val selectedWorkspaceId: String? = null,
    val destination: PersistedDestination = PersistedDestination(),
    val drafts: Map<String, PersistedDraft> = emptyMap(),
    val outbox: List<PersistedOutboxItem> = emptyList(),
    val widgetWorkspaceIds: Map<Int, String> = emptyMap(),
    val widgetSnapshots: Map<String, PersistedWidgetSnapshot> = emptyMap(),
    val recentAgents: List<PersistedAgentTarget> = emptyList(),
    val systemSearchEnabled: Boolean = false,
)

@Serializable
internal data class PersistedDestination(
    val kind: PersistedDestinationKind = PersistedDestinationKind.INBOX,
    val conversationId: String? = null,
    val agentId: String? = null,
    val spaceId: String? = null,
    val conversationIds: List<String> = emptyList(),
    val title: String? = null,
    val contentType: String? = null,
    val fileId: String? = null,
    val sourceUrl: String? = null,
    val returnTo: PersistedDestination? = null,
)

@Serializable
internal enum class PersistedDestinationKind {
    INBOX,
    COMPOSE,
    CATCH_UP,
    POD,
    POD_COMPOSE,
    CONVERSATION,
    CONVERSATION_FILES,
    ATTACHMENT,
}

@Serializable
internal data class PersistedDraft(
    val text: String = "",
    val selectedAgentId: String? = null,
    val selectedCapabilityIds: List<String> = emptyList(),
    val selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    val attachments: List<PersistedAttachment> = emptyList(),
    val pendingOutboxId: String? = null,
)

@Serializable
internal data class PersistedAttachment(
    val id: String,
    val fileName: String,
    val contentType: String,
    val fileSize: Int,
    val fileId: String,
)

@Serializable
internal data class PersistedOutboxItem(
    val id: String,
    val kind: PersistedOutboxKind,
    val workspaceId: String,
    val conversationId: String? = null,
    val createRequest: CreateConversationRequest? = null,
    val messageRequest: PostMessageRequest? = null,
    val contentFragments: List<ContentFragmentPayload> = emptyList(),
    val displayText: String? = null,
    val notificationReplyText: String? = null,
    val status: PersistedOutboxStatus = PersistedOutboxStatus.PENDING,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val resultConversationId: String? = null,
    val resultMessageId: String? = null,
    val createdAtEpochMillis: Long,
)

@Serializable
internal enum class PersistedOutboxKind {
    CREATE_CONVERSATION,
    POST_MESSAGE,
    NOTIFICATION_REPLY,
}

@Serializable
internal enum class PersistedOutboxStatus {
    PENDING,
    SENDING,
    SENT,
    FAILED,
}

@Serializable
internal data class PersistedWidgetSnapshot(
    val workspaceId: String? = null,
    val workspaceName: String? = null,
    val unreadCount: Int = 0,
    val mentionCount: Int = 0,
    val actionRequiredCount: Int = 0,
    val items: List<PersistedWidgetItem> = emptyList(),
    val updatedAtEpochMillis: Long = 0,
)

@Serializable
internal data class PersistedWidgetItem(
    val conversationId: String,
    val title: String,
    val unread: Boolean,
    val mentioned: Boolean,
    val actionRequired: Boolean,
    val updatedAtEpochMillis: Long,
)

@Serializable
internal data class PersistedAgentTarget(
    val workspaceId: String,
    val agentId: String,
    val name: String,
    val pictureUrl: String? = null,
    val lastUsedAtEpochMillis: Long,
)

internal fun composeDraftKey(workspaceId: String, spaceId: String?): String =
    "compose:$workspaceId:${spaceId.orEmpty()}"

internal fun replyDraftKey(workspaceId: String, conversationId: String): String =
    "reply:$workspaceId:$conversationId"
