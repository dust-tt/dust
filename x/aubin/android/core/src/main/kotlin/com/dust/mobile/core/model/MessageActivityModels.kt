package com.dust.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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

@Serializable
enum class ActionApproval {
    @SerialName("approved")
    APPROVED,

    @SerialName("rejected")
    REJECTED,

    @SerialName("always_approved")
    ALWAYS_APPROVED,
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
