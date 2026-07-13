package com.dust.mobile.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class ConversationPreview(
    val authorName: String? = null,
    val authorAvatarUrl: String? = null,
    val isAgent: Boolean = false,
    val snippet: String? = null,
    val replyCount: Int,
)

@Serializable(with = ConversationSerializer::class)
data class Conversation(
    val sId: String,
    val created: Double,
    val updated: Double,
    val title: String? = null,
    val unread: Boolean,
    val actionRequired: Boolean,
    val preview: ConversationPreview? = null,
) {
    val effectiveEpochMs: Double
        get() = if (updated > 0) updated else created
}

object ConversationSerializer : KSerializer<Conversation> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("Conversation")

    override fun deserialize(decoder: Decoder): Conversation {
        val input = decoder as? JsonDecoder
            ?: throw SerializationException("Conversation can only be decoded from JSON")
        val obj = input.decodeJsonElement().jsonObject
        val content = obj["content"]
        val lastVersions = content?.lastPreviewVersions()
        return Conversation(
            sId = obj.requiredString("sId"),
            created = obj.requiredDouble("created"),
            updated = obj.requiredDouble("updated"),
            title = obj["title"]?.jsonPrimitive?.contentOrNull,
            unread = obj.requiredBoolean("unread"),
            actionRequired = obj.requiredBoolean("actionRequired"),
            preview = lastVersions?.let(::previewFromMessages),
        )
    }

    override fun serialize(encoder: Encoder, value: Conversation) {
        throw SerializationException("Conversation serialization is not needed")
    }
}

@Serializable
data class ConversationsResponse(
    val conversations: List<Conversation>,
    val hasMore: Boolean,
    val lastValue: String? = null,
)

private data class PreviewMessage(
    val type: String,
    val content: String?,
    val visibility: String?,
    val status: String?,
    val userFullName: String?,
    val userImage: String?,
    val contextFullName: String?,
    val contextProfilePictureUrl: String?,
    val configurationName: String?,
    val configurationPictureUrl: String?,
) {
    val isValid: Boolean
        get() = when (type) {
            MessageType.USER.rawValue -> visibility == "visible"
            MessageType.AGENT.rawValue -> status == AgentMessageStatus.SUCCEEDED.rawValue
            else -> false
        }
}

private fun JsonElement.lastPreviewVersions(): List<PreviewMessage>? {
    val array = this as? JsonArray ?: return null
    if (array.isEmpty()) return emptyList()
    val first = array.first()
    val elements = if (first is JsonArray) {
        if (!array.all { it is JsonArray }) {
            return null
        }
        array.mapNotNull { versions -> versions.jsonArray.lastOrNull() }
    } else {
        array
    }
    return elements.map { element ->
        val obj = element as? JsonObject ?: return null
        obj.toPreviewMessageOrNull() ?: return null
    }
}

private fun JsonObject.toPreviewMessageOrNull(): PreviewMessage? {
    val type = stringOrNull("type") ?: return null
    return PreviewMessage(
        type = type,
        content = stringOrNull("content"),
        visibility = stringOrNull("visibility"),
        status = stringOrNull("status"),
        userFullName = objectOrNull("user")?.stringOrNull("fullName"),
        userImage = objectOrNull("user")?.stringOrNull("image"),
        contextFullName = objectOrNull("context")?.stringOrNull("fullName"),
        contextProfilePictureUrl = objectOrNull("context")?.stringOrNull("profilePictureUrl"),
        configurationName = objectOrNull("configuration")?.stringOrNull("name"),
        configurationPictureUrl = objectOrNull("configuration")?.stringOrNull("pictureUrl"),
    )
}

private fun previewFromMessages(content: List<PreviewMessage>): ConversationPreview? {
    val valid = content.filter { it.isValid }
    val first = valid.firstOrNull() ?: return null
    val authorName = if (first.type == MessageType.AGENT.rawValue) {
        first.configurationName
    } else {
        first.userFullName ?: first.contextFullName
    }
    val authorAvatarUrl = if (first.type == MessageType.AGENT.rawValue) {
        first.configurationPictureUrl
    } else {
        first.userImage ?: first.contextProfilePictureUrl
    }
    return ConversationPreview(
        authorName = authorName,
        authorAvatarUrl = authorAvatarUrl,
        isAgent = first.type == MessageType.AGENT.rawValue,
        snippet = first.content?.strippedSnippet(),
        replyCount = (valid.size - 1).coerceAtLeast(0),
    )
}

private fun String.strippedSnippet(): String =
    trim()
        .split(Regex("\\s+"))
        .joinToString(" ")
        .dropWhile { "#>-*` ".contains(it) }

internal fun JsonObject.requiredString(key: String): String =
    this[key]?.jsonPrimitive?.contentOrNull ?: throw SerializationException("Missing string: $key")

internal fun JsonObject.requiredDouble(key: String): Double =
    this[key]?.jsonPrimitive?.double ?: throw SerializationException("Missing double: $key")

internal fun JsonObject.requiredBoolean(key: String): Boolean =
    this[key]?.jsonPrimitive?.booleanOrNull ?: throw SerializationException("Missing boolean: $key")

internal fun JsonObject.stringOrNull(key: String): String? =
    this[key]?.jsonPrimitive?.contentOrNull

internal fun JsonObject.objectOrNull(key: String): JsonObject? =
    this[key] as? JsonObject
