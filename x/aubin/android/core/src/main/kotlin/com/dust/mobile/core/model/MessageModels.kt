package com.dust.mobile.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
enum class MessageType(val rawValue: String) {
    @SerialName("user_message")
    USER("user_message"),

    @SerialName("agent_message")
    AGENT("agent_message"),
}

@Serializable
enum class AgentMessageStatus(val rawValue: String) {
    @SerialName("created")
    CREATED("created"),

    @SerialName("succeeded")
    SUCCEEDED("succeeded"),

    @SerialName("failed")
    FAILED("failed"),

    @SerialName("cancelled")
    CANCELLED("cancelled"),

    @SerialName("interrupted")
    INTERRUPTED("interrupted"),

    @SerialName("gracefully_stopped")
    GRACEFULLY_STOPPED("gracefully_stopped"),
}

@Serializable
data class MessageUser(
    val fullName: String? = null,
    val image: String? = null,
)

@Serializable
data class UserMessageContext(
    val username: String? = null,
    val fullName: String? = null,
    val email: String? = null,
    val profilePictureUrl: String? = null,
    val selectedMCPServerViewIds: List<String>? = null,
)

@Serializable
data class ContentFragment(
    val id: Int,
    val sId: String,
    val created: Double,
    val title: String,
    val contentType: String,
    val fileId: String? = null,
    val snippet: String? = null,
    val sourceUrl: String? = null,
) {
    val isImage: Boolean
        get() = contentType.startsWith("image/")
}

@Serializable
data class UserMessage(
    val id: Int,
    val sId: String,
    val type: MessageType,
    val created: Double,
    val visibility: String,
    val version: Int,
    val rank: Int,
    val content: String,
    val user: MessageUser? = null,
    val context: UserMessageContext? = null,
    val contentFragments: List<ContentFragment>? = null,
) {
    val isPending: Boolean
        get() = visibility == "pending"

    val authorAvatarUrl: String?
        get() = user?.image ?: context?.profilePictureUrl

    val authorName: String?
        get() = user?.fullName ?: context?.fullName ?: context?.username
}

@Serializable
data class GeneratedFile(
    val fileId: String? = null,
    val filePath: String? = null,
    val title: String,
    val contentType: String,
    val createdAt: Double? = null,
    val updatedAt: Double? = null,
    val hidden: Boolean? = null,
) {
    val isVisible: Boolean
        get() = hidden != true
}

@Serializable
data class CitationReference(
    val title: String,
    val provider: String,
    val contentType: String,
    val description: String? = null,
    val href: String? = null,
)

@Serializable
data class AgentConfiguration(
    val sId: String,
    val name: String,
    val pictureUrl: String? = null,
)

@Serializable
data class AgentMessage(
    val sId: String,
    val type: MessageType,
    val created: Double,
    val visibility: String,
    val version: Int,
    val rank: Int,
    val status: AgentMessageStatus,
    val content: String? = null,
    val chainOfThought: String? = null,
    val configuration: AgentConfiguration,
    val generatedFiles: List<GeneratedFile>? = null,
    val citations: Map<String, CitationReference>? = null,
    val error: StreamingError? = null,
) {
    val isStreaming: Boolean
        get() = status == AgentMessageStatus.CREATED
}

sealed interface ActivityStep {
    val id: String

    data class Thinking(
        override val id: String,
        val content: String,
    ) : ActivityStep

    data class Action(
        override val id: String,
        val label: String,
        val serverName: String?,
    ) : ActivityStep
}

data class ActiveAction(
    val id: Int,
    val label: String,
    val serverName: String?,
)

enum class ActionApproval(val rawValue: String) {
    APPROVED("approved"),
    REJECTED("rejected"),
    ALWAYS_APPROVED("always_approved"),
}

@Serializable
enum class ToolStake {
    @SerialName("low")
    LOW,

    @SerialName("medium")
    MEDIUM,

    @SerialName("high")
    HIGH,

    @SerialName("never_ask")
    NEVER_ASK,
}

@Serializable
enum class ErrorCategory {
    @SerialName("retryable_model_error")
    RETRYABLE_MODEL_ERROR,

    @SerialName("context_window_exceeded")
    CONTEXT_WINDOW_EXCEEDED,

    @SerialName("empty_content")
    EMPTY_CONTENT,

    @SerialName("provider_internal_error")
    PROVIDER_INTERNAL_ERROR,

    @SerialName("stream_error")
    STREAM_ERROR,

    @SerialName("unknown_error")
    UNKNOWN_ERROR,

    @SerialName("invalid_response_format_configuration")
    INVALID_RESPONSE_FORMAT_CONFIGURATION,
}

data class ToolApprovalInfo(
    val actionId: String,
    val messageId: String,
    val conversationId: String,
    val triggeringUserId: String?,
    val toolName: String?,
    val mcpServerName: String?,
    val agentName: String?,
    val stake: ToolStake?,
    val inputs: Map<String, ToolInputValue>?,
    val argumentsRequiringApproval: List<String>?,
) {
    val canAlwaysAllow: Boolean
        get() = stake == ToolStake.LOW || stake == ToolStake.MEDIUM

    val displayableInputs: List<Pair<String, String>> =
        inputs.orEmpty()
            .mapNotNull { (key, value) ->
                value.displayValue?.let { display ->
                    key.humanized() to display.truncate(300)
                }
            }
            .sortedBy { it.first }

    companion object {
        fun from(event: ToolApproveExecutionEvent, fallbackMessageId: String, fallbackConversationId: String) =
            ToolApprovalInfo(
                actionId = event.actionId.orEmpty(),
                messageId = event.messageId ?: fallbackMessageId,
                conversationId = event.conversationId ?: fallbackConversationId,
                triggeringUserId = event.userId,
                toolName = event.metadata?.toolName,
                mcpServerName = event.metadata?.mcpServerName,
                agentName = event.metadata?.agentName,
                stake = event.stake?.toToolStakeOrNull(),
                inputs = event.inputs,
                argumentsRequiringApproval = event.argumentsRequiringApproval,
            )

        fun from(action: BlockedAction, fallbackConversationId: String) =
            ToolApprovalInfo(
                actionId = action.actionId.orEmpty(),
                messageId = action.messageId.orEmpty(),
                conversationId = action.conversationId ?: fallbackConversationId,
                triggeringUserId = action.userId,
                toolName = action.metadata?.toolName,
                mcpServerName = action.metadata?.mcpServerName,
                agentName = action.metadata?.agentName,
                stake = action.stake?.toToolStakeOrNull(),
                inputs = action.inputs,
                argumentsRequiringApproval = action.argumentsRequiringApproval,
            )
    }
}

data class ErrorInfo(
    val code: String?,
    val message: String,
    val category: ErrorCategory?,
    val errorTitle: String?,
    val messageId: String,
) {
    val isRetryable: Boolean
        get() = category == ErrorCategory.RETRYABLE_MODEL_ERROR ||
            category == ErrorCategory.STREAM_ERROR ||
            category == ErrorCategory.EMPTY_CONTENT

    companion object {
        fun from(error: StreamingError, messageId: String) =
            ErrorInfo(
                code = error.code,
                message = error.message,
                category = error.metadata?.category?.toErrorCategoryOrNull(),
                errorTitle = error.metadata?.errorTitle,
                messageId = messageId,
            )
    }
}

sealed interface BlockedState {
    data class Approval(val approval: ToolApprovalInfo) : BlockedState
    data class PersonalAuth(val provider: String, val toolName: String) : BlockedState
    data class FileAuth(val fileName: String, val toolName: String) : BlockedState
    data class UserQuestionRequired(val question: UserQuestionInfo) : BlockedState
}

data class UserQuestionInfo(
    val actionId: String,
    val messageId: String,
    val conversationId: String,
    val triggeringUserId: String?,
    val question: UserQuestion,
) {
    companion object {
        fun from(event: ToolAskUserQuestionEvent, fallbackMessageId: String, fallbackConversationId: String) =
            UserQuestionInfo(
                actionId = event.actionId.orEmpty(),
                messageId = event.messageId ?: fallbackMessageId,
                conversationId = event.conversationId ?: fallbackConversationId,
                triggeringUserId = event.userId,
                question = event.question,
            )

        fun from(action: BlockedAction, question: UserQuestion, fallbackConversationId: String) =
            UserQuestionInfo(
                actionId = action.actionId.orEmpty(),
                messageId = action.messageId.orEmpty(),
                conversationId = action.conversationId ?: fallbackConversationId,
                triggeringUserId = action.userId,
                question = question,
            )
    }
}

fun canRespondToBlockedAction(triggeringUserId: String?, currentUserSId: String?): Boolean =
    triggeringUserId == null || triggeringUserId == currentUserSId

sealed interface AgentStreamingPhase {
    data object Idle : AgentStreamingPhase
    data object Thinking : AgentStreamingPhase
    data object Generating : AgentStreamingPhase
    data class PersonalAuthRequired(val provider: String, val toolName: String) : AgentStreamingPhase
    data class FileAuthRequired(val fileName: String, val toolName: String) : AgentStreamingPhase
    data class ApprovalRequired(val approval: ToolApprovalInfo) : AgentStreamingPhase
    data class UserQuestionRequired(val question: UserQuestionInfo) : AgentStreamingPhase
}

fun BlockedState.asPhase(): AgentStreamingPhase = when (this) {
    is BlockedState.Approval -> AgentStreamingPhase.ApprovalRequired(approval)
    is BlockedState.FileAuth -> AgentStreamingPhase.FileAuthRequired(fileName, toolName)
    is BlockedState.PersonalAuth -> AgentStreamingPhase.PersonalAuthRequired(provider, toolName)
    is BlockedState.UserQuestionRequired -> AgentStreamingPhase.UserQuestionRequired(question)
}

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
            MessageType.USER.rawValue -> ConversationMessage.User(input.json.decodeFromJsonElement(UserMessage.serializer(), element))
            MessageType.AGENT.rawValue -> ConversationMessage.Agent(input.json.decodeFromJsonElement(AgentMessage.serializer(), element))
            else -> throw SerializationException("Unsupported message type: $type")
        }
    }

    override fun serialize(encoder: Encoder, value: ConversationMessage) {
        val output = encoder as? JsonEncoder
            ?: throw SerializationException("ConversationMessage can only be encoded to JSON")
        when (value) {
            is ConversationMessage.Agent -> output.encodeSerializableValue(AgentMessage.serializer(), value.message)
            is ConversationMessage.User -> output.encodeSerializableValue(UserMessage.serializer(), value.message)
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

    data object NullValue : ToolInputValue {
        override val displayValue: String? = null
    }
}

object ToolInputValueSerializer : KSerializer<ToolInputValue> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("ToolInputValue", PrimitiveKind.STRING)

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
            else -> ToolInputValue.NullValue
        }
    }

    override fun serialize(encoder: Encoder, value: ToolInputValue) {
        val output = encoder as? JsonEncoder
            ?: throw SerializationException("ToolInputValue can only be encoded to JSON")
        val element = when (value) {
            is ToolInputValue.BoolValue -> JsonPrimitive(value.value)
            ToolInputValue.NullValue -> JsonNull
            is ToolInputValue.NumberValue -> JsonPrimitive(value.value)
            is ToolInputValue.StringValue -> JsonPrimitive(value.value)
        }
        output.encodeJsonElement(element)
    }
}

private fun String.toToolStakeOrNull(): ToolStake? = when (this) {
    "low" -> ToolStake.LOW
    "medium" -> ToolStake.MEDIUM
    "high" -> ToolStake.HIGH
    "never_ask" -> ToolStake.NEVER_ASK
    else -> null
}

private fun String.toErrorCategoryOrNull(): ErrorCategory? = when (this) {
    "retryable_model_error" -> ErrorCategory.RETRYABLE_MODEL_ERROR
    "context_window_exceeded" -> ErrorCategory.CONTEXT_WINDOW_EXCEEDED
    "empty_content" -> ErrorCategory.EMPTY_CONTENT
    "provider_internal_error" -> ErrorCategory.PROVIDER_INTERNAL_ERROR
    "stream_error" -> ErrorCategory.STREAM_ERROR
    "unknown_error" -> ErrorCategory.UNKNOWN_ERROR
    "invalid_response_format_configuration" -> ErrorCategory.INVALID_RESPONSE_FORMAT_CONFIGURATION
    else -> null
}

private fun String.humanized(): String =
    buildString {
        this@humanized.forEach { char ->
            if (char.isUpperCase() && isNotEmpty()) {
                append(' ')
            }
            append(char)
        }
    }
        .replace("_", " ")
        .split(Regex("\\s+"))
        .filter { it.isNotBlank() }
        .joinToString(" ") { word -> word.lowercase().replaceFirstChar { it.uppercase() } }

private fun String.truncate(limit: Int): String =
    if (length > limit) take(limit) + "\u2026" else this
