package com.dust.mobile.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject

@Serializable
enum class ConversationVisibility {
    @SerialName("unlisted")
    UNLISTED,

    @SerialName("deleted")
    DELETED,

    @SerialName("test")
    TEST,
}

@Serializable
data class CreateConversationRequest(
    val title: String? = null,
    val visibility: ConversationVisibility = ConversationVisibility.UNLISTED,
    val spaceId: String? = null,
    val message: CreateMessagePayload,
    val contentFragments: List<ContentFragmentPayload> = emptyList(),
)

@Serializable
data class CreateMessagePayload(
    val content: String,
    val mentions: List<MentionPayload>,
    val context: MessageContext,
)

@Serializable
data class MentionPayload(
    val configurationId: String,
)

@Serializable
data class MessageContext(
    val timezone: String,
    val profilePictureUrl: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val selectedMCPServerViewIds: List<String>? = null,
)

@Serializable
data class PostMessageRequest(
    val content: String,
    val mentions: List<MentionPayload>,
    val context: MessageContext,
)

@Serializable
data class PostMessageResponse(
    val message: UserMessage,
)

@Serializable(with = ContentFragmentPayloadSerializer::class)
sealed interface ContentFragmentPayload {
    val title: String
    val context: ContentFragmentContext
    val url: String?

    @Serializable
    data class File(
        override val title: String,
        val fileId: String,
        override val context: ContentFragmentContext,
        @OptIn(ExperimentalSerializationApi::class)
        @EncodeDefault(EncodeDefault.Mode.NEVER)
        override val url: String? = null,
    ) : ContentFragmentPayload

    @Serializable
    data class Node(
        override val title: String,
        val nodeId: String,
        val nodeDataSourceViewId: String,
        override val context: ContentFragmentContext,
        @OptIn(ExperimentalSerializationApi::class)
        @EncodeDefault(EncodeDefault.Mode.NEVER)
        override val url: String? = null,
    ) : ContentFragmentPayload

    companion object {
        fun file(
            title: String,
            fileId: String,
            context: ContentFragmentContext,
            url: String? = null,
        ): ContentFragmentPayload = File(
            title = title,
            fileId = fileId,
            context = context,
            url = url,
        )

        fun node(
            title: String,
            nodeId: String,
            nodeDataSourceViewId: String,
            context: ContentFragmentContext,
            url: String? = null,
        ): ContentFragmentPayload =
            Node(
                title = title,
                nodeId = nodeId,
                nodeDataSourceViewId = nodeDataSourceViewId,
                context = context,
                url = url,
            )
    }
}

object ContentFragmentPayloadSerializer : KSerializer<ContentFragmentPayload> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ContentFragmentPayload")

    override fun deserialize(decoder: Decoder): ContentFragmentPayload {
        val input = decoder as? JsonDecoder
            ?: throw SerializationException("ContentFragmentPayload can only be decoded from JSON")
        val element = input.decodeJsonElement()
        val obj = element.jsonObject
        return when {
            obj["fileId"] != null && obj["nodeId"] == null && obj["nodeDataSourceViewId"] == null ->
                input.json.decodeFromJsonElement(ContentFragmentPayload.File.serializer(), element)
            obj["fileId"] == null && obj["nodeId"] != null && obj["nodeDataSourceViewId"] != null ->
                input.json.decodeFromJsonElement(ContentFragmentPayload.Node.serializer(), element)
            else -> throw SerializationException("Content fragment must reference exactly one file or node")
        }
    }

    override fun serialize(encoder: Encoder, value: ContentFragmentPayload) {
        val output = encoder as? JsonEncoder
            ?: throw SerializationException("ContentFragmentPayload can only be encoded to JSON")
        when (value) {
            is ContentFragmentPayload.File -> output.encodeSerializableValue(
                ContentFragmentPayload.File.serializer(),
                value,
            )
            is ContentFragmentPayload.Node -> output.encodeSerializableValue(
                ContentFragmentPayload.Node.serializer(),
                value,
            )
        }
    }
}

@Serializable
data class ContentFragmentContext(
    val profilePictureUrl: String? = null,
)

@Serializable
data class PostContentFragmentResponse(
    val contentFragment: ContentFragmentInfo,
)

@Serializable
data class ContentFragmentInfo(
    val sId: String,
)
