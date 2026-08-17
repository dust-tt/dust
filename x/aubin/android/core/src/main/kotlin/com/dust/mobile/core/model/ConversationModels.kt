package com.dust.mobile.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Transient
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

// Global conversation list responses intentionally do not include message content or descriptions.
@Serializable
data class Conversation(
    val sId: String,
    val created: Double,
    val updated: Double,
    val title: String? = null,
    val unread: Boolean,
    val actionRequired: Boolean,
    val hasError: Boolean = false,
    val lastReadMs: Double? = null,
    val nextWakeupAt: Double? = null,
    val requestedSpaceIds: List<String> = emptyList(),
    val spaceId: String? = null,
    val triggerId: String? = null,
    val isRunningAgentLoop: Boolean = false,
    @Transient val description: String? = null,
) {
    val effectiveEpochMs: Double
        get() = if (updated > 0) updated else created
}

@Serializable
data class PodConversationParticipant(
    val name: String,
    val visual: String,
    val isRounded: Boolean,
)

@Serializable
data class PodConversation(
    val id: String,
    val title: String,
    val created: Double,
    val updated: Double,
    val replyCount: Int,
    val unreadMessageCount: Int,
    val isRunningAgentLoop: Boolean,
    val description: String,
    // The server currently omits this key when a conversation has no participants.
    val creator: PodConversationParticipant? = null,
    val avatars: List<PodConversationParticipant>,
) {
    fun asConversation(): Conversation = Conversation(
        sId = id,
        created = created,
        updated = updated,
        title = title,
        unread = unreadMessageCount > 0,
        actionRequired = false,
        isRunningAgentLoop = isRunningAgentLoop,
        description = description,
    )
}

@Serializable
data class PodConversationsResponse(
    val conversations: List<PodConversation>,
    val hasMore: Boolean,
    val lastValue: String? = null,
    val isEmpty: Boolean,
)

@Serializable
data class ConversationsResponse(
    val conversations: List<Conversation>,
    val hasMore: Boolean,
    val lastValue: String? = null,
)

internal fun JsonObject.requiredString(key: String): String =
    this[key]?.jsonPrimitive?.contentOrNull ?: throw SerializationException("Missing string: $key")

internal fun JsonObject.requiredBoolean(key: String): Boolean =
    this[key]?.jsonPrimitive?.booleanOrNull ?: throw SerializationException("Missing boolean: $key")

internal fun JsonObject.stringOrNull(key: String): String? =
    this[key]?.jsonPrimitive?.contentOrNull
