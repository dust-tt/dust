package com.dust.mobile.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

@Serializable(with = ToolInputValueSerializer::class)
sealed interface ToolInputValue {
    val displayValue: String?

    data class StringValue(val value: String) : ToolInputValue {
        override val displayValue: String? = value.ifEmpty { null }
    }

    data class NumberValue(val value: Double) : ToolInputValue {
        override val displayValue: String = value.toString()
    }

    data class BoolValue(val value: Boolean) : ToolInputValue {
        override val displayValue: String = if (value) "Yes" else "No"
    }

    data class ArrayValue(val value: JsonArray) : ToolInputValue {
        override val displayValue: String = value.toString()
    }

    data class ObjectValue(val value: JsonObject) : ToolInputValue {
        override val displayValue: String = value.toString()
    }

    data object NullValue : ToolInputValue {
        override val displayValue: String? = null
    }
}

object ToolInputValueSerializer : KSerializer<ToolInputValue> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): ToolInputValue {
        val input = decoder as? JsonDecoder
            ?: throw SerializationException("ToolInputValue can only be decoded from JSON")
        return when (val element: JsonElement = input.decodeJsonElement()) {
            JsonNull -> ToolInputValue.NullValue
            is JsonPrimitive -> when {
                element.isString -> ToolInputValue.StringValue(element.content)
                element.booleanOrNull != null -> ToolInputValue.BoolValue(element.booleanOrNull == true)
                element.doubleOrNull != null -> ToolInputValue.NumberValue(element.doubleOrNull ?: 0.0)
                else -> ToolInputValue.NullValue
            }
            is JsonArray -> ToolInputValue.ArrayValue(element)
            is JsonObject -> ToolInputValue.ObjectValue(element)
        }
    }

    override fun serialize(encoder: Encoder, value: ToolInputValue) {
        val output = encoder as? JsonEncoder
            ?: throw SerializationException("ToolInputValue can only be encoded to JSON")
        val element = when (value) {
            is ToolInputValue.ArrayValue -> value.value
            is ToolInputValue.BoolValue -> JsonPrimitive(value.value)
            ToolInputValue.NullValue -> JsonNull
            is ToolInputValue.NumberValue -> JsonPrimitive(value.value)
            is ToolInputValue.ObjectValue -> value.value
            is ToolInputValue.StringValue -> JsonPrimitive(value.value)
        }
        output.encodeJsonElement(element)
    }
}
