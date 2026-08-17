package com.dust.mobile.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

data class SSEEnvelope(
    val eventId: String,
    val data: StreamingEventData,
)

data class ConversationEventEnvelope(
    val eventId: String,
    val data: ConversationEventData,
)

sealed interface ConversationEventData {
    data class AgentMessageNew(val event: AgentMessageNewEvent) : ConversationEventData
    data class AgentMessageDone(val event: AgentMessageDoneEventData) : ConversationEventData
    data class UserMessageNew(val event: UserMessageNewEvent) : ConversationEventData
    data class UserMessagePromoted(val event: UserMessagePromotedEvent) : ConversationEventData
    data class ConversationTitle(val event: ConversationTitleEvent) : ConversationEventData
    data class Unknown(val type: String) : ConversationEventData
}

@Serializable
data class AgentMessageNewEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val message: AgentMessage,
)

@Serializable
data class AgentMessageDoneEventData(
    val created: Double,
    val conversationId: String,
    val configurationId: String,
    val messageId: String,
    val status: String,
)

@Serializable
data class UserMessageNewEvent(
    val created: Double,
    val messageId: String,
    val message: UserMessage,
)

@Serializable
data class UserMessagePromotedEvent(
    val created: Double,
    val messageId: String,
)

@Serializable
data class ConversationTitleEvent(
    val created: Double,
    val title: String,
)

sealed interface StreamingEventData {
    data class GenerationTokens(val event: GenerationTokensEvent) : StreamingEventData
    data class AgentActionSuccess(val event: AgentActionSuccessEvent) : StreamingEventData
    data class ToolParams(val event: ToolParamsEvent) : StreamingEventData
    data class ToolNotification(val event: ToolNotificationEvent) : StreamingEventData
    data class AgentMessageSuccess(val event: AgentMessageSuccessEvent) : StreamingEventData
    data class AgentError(val event: AgentErrorEvent) : StreamingEventData
    data class ToolError(val event: ToolErrorEvent) : StreamingEventData
    data class AgentGenerationCancelled(val event: AgentGenerationCancelledEvent) : StreamingEventData
    data class AgentMessageGracefullyStopped(val event: AgentMessageGracefullyStoppedEvent) : StreamingEventData
    data class ToolPersonalAuthRequired(val event: ToolPersonalAuthRequiredEvent) : StreamingEventData
    data class ToolFileAuthRequired(val event: ToolFileAuthRequiredEvent) : StreamingEventData
    data class ToolApproveExecution(val event: ToolApproveExecutionEvent) : StreamingEventData
    data class ToolAskUserQuestion(val event: ToolAskUserQuestionEvent) : StreamingEventData
    data object AgentContextPruned : StreamingEventData
    data object EndOfStream : StreamingEventData
    data class Unknown(val type: String) : StreamingEventData
}

@Serializable
enum class TokenClassification {
    @SerialName("tokens")
    TOKENS,

    @SerialName("chain_of_thought")
    CHAIN_OF_THOUGHT,

    @SerialName("opening_delimiter")
    OPENING_DELIMITER,

    @SerialName("closing_delimiter")
    CLOSING_DELIMITER,
}

@Serializable
data class GenerationTokensEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val text: String,
    val classification: TokenClassification,
    val traceId: String? = null,
    val step: Int? = null,
)

@Serializable
data class AgentActionSuccessEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val action: ActionSummary,
)

@Serializable
data class ActionSummary(
    val id: Int,
    val toolName: String? = null,
    val internalMCPServerName: String? = null,
    val functionCallName: String? = null,
    val displayLabels: ActionDisplayLabels? = null,
)

@Serializable
data class ActionDisplayLabels(
    val running: String,
    val done: String,
)

@Serializable
data class ToolParamsEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val action: ActionSummary,
)

@Serializable
data class AgentMessageSuccessEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val message: AgentMessage,
)

@Serializable
data class AgentErrorEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val error: StreamingError,
)

@Serializable
data class ToolErrorEvent(
    val created: Double,
    val error: StreamingError,
)

@Serializable
data class AgentGenerationCancelledEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val status: String? = null,
)

@Serializable
data class AgentMessageGracefullyStoppedEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
    val message: AgentMessage,
)

@Serializable
data class ToolNotificationEvent(
    val created: Double,
    val configurationId: String,
    val messageId: String,
)

@Serializable
data class ToolPersonalAuthRequiredEvent(
    val authError: ToolPersonalAuthError,
)

@Serializable
data class ToolPersonalAuthError(
    val provider: String,
    val toolName: String,
    val message: String,
)

@Serializable
data class ToolFileAuthRequiredEvent(
    val fileAuthError: ToolFileAuthError,
)

@Serializable
data class ToolFileAuthError(
    val fileName: String,
    val toolName: String,
    val message: String,
)

@Serializable
data class ToolApproveExecutionEvent(
    val created: Double? = null,
    val conversationId: String? = null,
    val messageId: String? = null,
    val actionId: String? = null,
    val userId: String? = null,
    val configurationId: String? = null,
    val stake: String? = null,
    val metadata: ToolApprovalMetadata? = null,
    val inputs: Map<String, ToolInputValue>? = null,
    val argumentsRequiringApproval: List<String>? = null,
)

@Serializable
data class ToolApprovalMetadata(
    val toolName: String? = null,
    val mcpServerName: String? = null,
    val agentName: String? = null,
)

@Serializable
data class ToolAskUserQuestionEvent(
    val conversationId: String? = null,
    val messageId: String? = null,
    val actionId: String? = null,
    val userId: String? = null,
    val question: UserQuestion,
)

@Serializable
data class UserQuestion(
    val question: String,
    val options: List<UserQuestionOption>,
    val multiSelect: Boolean,
)

@Serializable
data class UserQuestionOption(
    val label: String,
    val description: String? = null,
)

@Serializable
data class UserQuestionAnswer(
    val selectedOptions: List<Int>,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val customResponse: String? = null,
)

@Serializable
data class StreamingError(
    val code: String? = null,
    val message: String,
    val metadata: StreamingErrorMetadata? = null,
)

@Serializable
data class StreamingErrorMetadata(
    val category: String? = null,
    val errorTitle: String? = null,
)

@Serializable
data class BlockedActionsResponse(
    val blockedActions: List<BlockedAction>,
)

@Serializable
enum class BlockedActionStatus {
    @SerialName("blocked_validation_required")
    BLOCKED_VALIDATION_REQUIRED,

    @SerialName("blocked_authentication_required")
    BLOCKED_AUTHENTICATION_REQUIRED,

    @SerialName("blocked_file_authorization_required")
    BLOCKED_FILE_AUTHORIZATION_REQUIRED,

    @SerialName("blocked_child_action_input_required")
    BLOCKED_CHILD_ACTION_INPUT_REQUIRED,

    @SerialName("blocked_user_answer_required")
    BLOCKED_USER_ANSWER_REQUIRED,
}

@Serializable
data class BlockedAction(
    val status: BlockedActionStatus,
    val conversationId: String? = null,
    val messageId: String? = null,
    val actionId: String? = null,
    val userId: String? = null,
    val configurationId: String? = null,
    val stake: String? = null,
    val metadata: ToolApprovalMetadata? = null,
    val inputs: Map<String, ToolInputValue>? = null,
    val argumentsRequiringApproval: List<String>? = null,
    val authError: ToolPersonalAuthError? = null,
    val fileAuthorizationInfo: BlockedFileAuthInfo? = null,
    val question: UserQuestion? = null,
)

@Serializable
data class BlockedFileAuthInfo(
    val fileName: String? = null,
    val toolName: String? = null,
)
