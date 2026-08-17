package com.dust.mobile.android.preview

import com.dust.mobile.android.ui.composer.AttachmentDraft
import com.dust.mobile.android.ui.composer.AttachmentUploadState
import com.dust.mobile.android.ui.inbox.ConversationListState
import com.dust.mobile.android.ui.preview.localPreviewDustUser
import com.dust.mobile.android.ui.preview.localPreviewPods
import com.dust.mobile.android.ui.preview.localPreviewWorkspaces
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ToolApprovalInfo
import com.dust.mobile.core.model.ToolInputValue
import com.dust.mobile.core.model.ToolStake
import com.dust.mobile.core.model.UserQuestion
import com.dust.mobile.core.model.UserQuestionInfo
import com.dust.mobile.core.model.UserQuestionOption

internal const val PREVIEW_EPOCH_MS = 1_785_859_200_000L

internal fun previewInboxState(): ConversationListState {
    val workspaces = localPreviewWorkspaces()
    return ConversationListState(
        isLoading = false,
        dustUser = localPreviewDustUser(),
        workspace = workspaces.first(),
        workspaces = workspaces,
        conversations = previewConversationStates().take(6),
        pods = localPreviewPods(),
        isPodsExpanded = true,
    )
}

internal fun previewConversationStates(): List<Conversation> = listOf(
    previewConversation(
        id = "preview-action",
        title = "Review the Q3 customer briefing",
        actionRequired = true,
        spaceId = "local-pod-customers",
    ),
    previewConversation(
        id = "preview-unread",
        title = "Coordinate launch follow-ups",
        unread = true,
        spaceId = "local-pod-mobile",
    ),
    previewConversation(
        id = "preview-running",
        title = "Draft the account review",
        isRunning = true,
    ),
    previewConversation(
        id = "preview-error",
        title = "Refresh the customer metrics",
        hasError = true,
    ),
    previewConversation(
        id = "preview-scheduled",
        title = "Send the weekly account digest",
        nextWakeupAt = PREVIEW_EPOCH_MS + 86_400_000,
    ),
    previewConversation(
        id = "preview-automated",
        title = "Summarize workspace changes",
        triggerId = "preview-trigger",
    ),
    previewConversation(
        id = "preview-read",
        title = "Research onboarding examples",
    ),
)

private fun previewConversation(
    id: String,
    title: String,
    unread: Boolean = false,
    actionRequired: Boolean = false,
    hasError: Boolean = false,
    spaceId: String? = null,
    isRunning: Boolean = false,
    nextWakeupAt: Long? = null,
    triggerId: String? = null,
) = Conversation(
    sId = id,
    created = (PREVIEW_EPOCH_MS - 3_600_000).toDouble(),
    updated = PREVIEW_EPOCH_MS.toDouble(),
    title = title,
    unread = unread,
    actionRequired = actionRequired,
    hasError = hasError,
    spaceId = spaceId,
    isRunningAgentLoop = isRunning,
    nextWakeupAt = nextWakeupAt?.toDouble(),
    triggerId = triggerId,
)

internal fun previewAttachmentDrafts(): List<AttachmentDraft> = listOf(
    AttachmentDraft(
        id = "preview-attachment",
        fileName = "Customer brief.pdf",
        contentType = "application/pdf",
        fileSize = 82_304,
        data = ByteArray(0),
        uploadState = AttachmentUploadState.Uploaded("preview-file"),
    ),
)

internal fun previewApprovalState(): BlockedState = BlockedState.Approval(
    ToolApprovalInfo(
        actionId = "preview-approval",
        messageId = "preview-message",
        conversationId = "preview-conversation",
        triggeringUserId = "local-preview-user",
        toolName = "post_message",
        mcpServerName = "Slack",
        agentName = "Dust",
        stake = ToolStake.MEDIUM,
        inputs = mapOf(
            "channel" to ToolInputValue.StringValue("#customer-launch"),
            "message" to ToolInputValue.StringValue("Share the approved launch summary."),
        ),
        argumentsRequiringApproval = listOf("channel", "message"),
    ),
)

internal fun previewQuestionState(): BlockedState = BlockedState.UserQuestionRequired(
    UserQuestionInfo(
        actionId = "preview-question",
        messageId = "preview-message",
        conversationId = "preview-conversation",
        triggeringUserId = "local-preview-user",
        question = UserQuestion(
            question = "Which audience should receive the briefing?",
            options = listOf(
                UserQuestionOption("Account team", "Sales and customer success owners"),
                UserQuestionOption("Leadership", "Executive stakeholders and sponsors"),
                UserQuestionOption("Customer", "External customer-ready version"),
            ),
            multiSelect = false,
        ),
    ),
)
