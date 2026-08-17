package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.ui.composer.AttachmentDraft
import com.dust.mobile.android.ui.composer.hasFailedUploads
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.canSendMessage
import com.dust.mobile.core.model.retargetReplyAgentForMessages
import com.dust.mobile.core.stream.AgentMessageStream

data class InlineActivityState(
    val activity: AgentMessageStream.Activity = AgentMessageStream.Activity.THINKING,
    val activeActions: List<ActiveAction> = emptyList(),
    val completedSteps: List<ActivityStep> = emptyList(),
)

data class ConversationDetailState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val refreshError: String? = null,
    val conversationTitle: String? = null,
    val messages: List<ConversationMessage> = emptyList(),
    val hasMore: Boolean = false,
    val lastValue: Int? = null,
    val isLoadingMore: Boolean = false,
    val blockedState: BlockedState? = null,
    val actionError: String? = null,
    val isValidatingAction: Boolean = false,
    val streamingMessageId: String? = null,
    val inlineActivities: Map<String, InlineActivityState> = emptyMap(),
    val lastError: ErrorInfo? = null,
    val replyText: String = "",
    val agents: List<LightAgentConfiguration> = emptyList(),
    val selectedReplyAgent: LightAgentConfiguration? = null,
    val availableCapabilities: List<Capability> = emptyList(),
    val selectedCapabilities: List<Capability> = emptyList(),
    val knowledgeQuery: String = "",
    val knowledgeResults: List<KnowledgeItem> = emptyList(),
    val selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    val isSearchingKnowledge: Boolean = false,
    val attachments: List<AttachmentDraft> = emptyList(),
    val isLoadingSkills: Boolean = false,
    val isSending: Boolean = false,
    val pendingOutboxId: String? = null,
) {
    val canSendReply: Boolean
        get() = pendingOutboxId == null && canSendMessage(
            text = replyText,
            hasAttachments = attachments.isNotEmpty(),
            hasSkillReferences = selectedCapabilities.any { it is Capability.SkillCapability },
            hasFailedUploads = attachments.hasFailedUploads,
            isSending = isSending,
        )
}

internal fun ConversationDetailState.withMessages(messages: List<ConversationMessage>): ConversationDetailState =
    copy(
        messages = messages,
        selectedReplyAgent = retargetReplyAgentForMessages(
            previousMessages = this.messages,
            nextMessages = messages,
            agents = agents,
            selectedAgent = selectedReplyAgent,
        ),
    )

internal fun ConversationDetailState.shouldHandleAgentMessageDone(messageId: String): Boolean =
    streamingMessageId == messageId ||
        messages.any { message ->
            message is ConversationMessage.Agent &&
                message.message.sId == messageId &&
                message.message.isStreaming
        }

internal fun ConversationDetailState.withAppliedStreamSnapshot(
    messageId: String,
    snapshot: AgentMessageStream.Snapshot,
): ConversationDetailState =
    copy(
        messages = messages.map { item ->
            if (item !is ConversationMessage.Agent || item.message.sId != messageId) {
                item
            } else {
                item.copy(
                    message = item.message.copy(
                        content = if (snapshot.content.isEmpty()) item.message.content else snapshot.content,
                        chainOfThought = if (snapshot.isFinished || snapshot.chainOfThought != null) {
                            snapshot.chainOfThought
                        } else {
                            item.message.chainOfThought
                        },
                        status = snapshot.status ?: item.message.status,
                        generatedFiles = snapshot.generatedFiles ?: item.message.generatedFiles,
                        citations = snapshot.citations ?: item.message.citations,
                    ),
                )
            }
        },
        streamingMessageId = messageId,
        inlineActivities = inlineActivities + (
            messageId to InlineActivityState(
                activity = snapshot.activity,
                activeActions = snapshot.activeActions,
                completedSteps = snapshot.completedSteps,
            )
        ),
        lastError = snapshot.error ?: if (snapshot.status == null) {
            lastError
        } else {
            lastError?.takeUnless { it.messageId == messageId }
        },
    )

internal fun ConversationDetailState.withClearedLiveStream(): ConversationDetailState {
    val messageId = streamingMessageId
    val retainedActivities = if (messageId != null) {
        inlineActivities[messageId]?.let { activity ->
            inlineActivities + (messageId to activity.copy(activeActions = emptyList()))
        } ?: inlineActivities
    } else {
        inlineActivities
    }
    return copy(
        blockedState = null,
        streamingMessageId = null,
        inlineActivities = retainedActivities,
    )
}

internal fun fallbackAgentMessageDoneStatus(status: String): AgentMessageStatus? =
    if (status == "error") AgentMessageStatus.FAILED else null

internal fun shouldMarkConversationAsReadOnOpen(conversation: Conversation): Boolean =
    conversation.unread || conversation.actionRequired

internal fun List<ConversationMessage>.sortedByRank(): List<ConversationMessage> =
    sortedWith(compareBy<ConversationMessage> { it.rank }.thenBy { it.created })
