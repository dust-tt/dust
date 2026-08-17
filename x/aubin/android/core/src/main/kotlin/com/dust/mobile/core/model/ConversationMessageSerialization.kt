package com.dust.mobile.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

@Serializable(with = ConversationMessageSerializer::class)
sealed interface ConversationMessage {
    val id: String
    val rank: Int
    val created: Double

    data class User(val message: UserMessage) : ConversationMessage {
        override val id: String = message.sId
        override val rank: Int = message.rank
        override val created: Double = message.created
    }

    data class Agent(val message: AgentMessage) : ConversationMessage {
        override val id: String = message.sId
        override val rank: Int = message.rank
        override val created: Double = message.created
    }
}

object ConversationMessageSerializer : KSerializer<ConversationMessage> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ConversationMessage")

    override fun deserialize(decoder: Decoder): ConversationMessage {
        val input = decoder as? JsonDecoder
            ?: throw SerializationException("ConversationMessage can only be decoded from JSON")
        val element = input.decodeJsonElement()
        val type = element.jsonObject.requiredString("type")
        return when (type) {
            MessageType.USER.rawValue -> ConversationMessage.User(
                input.json.decodeFromJsonElement(UserMessage.serializer(), element),
            )
            MessageType.AGENT.rawValue -> ConversationMessage.Agent(
                input.json.decodeFromJsonElement(AgentMessage.serializer(), element),
            )
            else -> throw SerializationException("Unsupported message type: $type")
        }
    }

    override fun serialize(encoder: Encoder, value: ConversationMessage) {
        val output = encoder as? JsonEncoder
            ?: throw SerializationException("ConversationMessage can only be encoded to JSON")
        when (value) {
            is ConversationMessage.Agent -> output.encodeSerializableValue(
                AgentMessage.serializer(),
                value.message,
            )
            is ConversationMessage.User -> output.encodeSerializableValue(
                UserMessage.serializer(),
                value.message,
            )
        }
    }
}

@Serializable(with = ConversationMessagesResponseSerializer::class)
data class ConversationMessagesResponse(
    val messages: List<ConversationMessage>,
    val hasMore: Boolean,
    val lastValue: Int? = null,
)

object ConversationMessagesResponseSerializer : KSerializer<ConversationMessagesResponse> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("ConversationMessagesResponse")

    override fun deserialize(decoder: Decoder): ConversationMessagesResponse {
        val input = decoder as? JsonDecoder
            ?: throw SerializationException("ConversationMessagesResponse can only be decoded from JSON")
        val obj = input.decodeJsonElement().jsonObject
        val messages = (obj["messages"] ?: throw SerializationException("Missing array: messages"))
            .jsonArray
            .mapNotNull { element ->
                val type = element.jsonObject.stringOrNull("type")
                when (type) {
                    MessageType.USER.rawValue, MessageType.AGENT.rawValue ->
                        input.json.decodeFromJsonElement(ConversationMessageSerializer, element)
                    else -> null
                }
            }
        return ConversationMessagesResponse(
            messages = messages,
            hasMore = obj.requiredBoolean("hasMore"),
            lastValue = obj.optionalInt("lastValue"),
        )
    }

    override fun serialize(encoder: Encoder, value: ConversationMessagesResponse) {
        throw SerializationException("ConversationMessagesResponse serialization is not needed")
    }
}

private fun JsonObject.optionalInt(key: String): Int? {
    val element = this[key] ?: return null
    if (element == JsonNull) {
        return null
    }
    val primitive = element as? JsonPrimitive
        ?: throw SerializationException("Missing integer: $key")
    if (primitive.isString) {
        throw SerializationException("Missing integer: $key")
    }
    return primitive.content.toIntOrNull()
        ?: throw SerializationException("Missing integer: $key")
}
