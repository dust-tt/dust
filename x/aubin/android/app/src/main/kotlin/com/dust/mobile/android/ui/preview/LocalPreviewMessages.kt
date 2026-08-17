package com.dust.mobile.android.ui.preview

import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.MessageUser
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.UserMessageContext

internal fun localPreviewMessages(conversationId: String): List<ConversationMessage> {
    val title = when {
        conversationId.contains("briefing-mobile") -> "Finalize launch readiness"
        conversationId.contains("launch-mobile") -> "Align stakeholder follow-ups"
        conversationId.contains("weekly-mobile") -> "Summarize launch changes"
        conversationId.contains("briefing") -> "Prepare the Q3 customer briefing"
        conversationId.contains("launch") -> "Coordinate launch follow-ups"
        conversationId.contains("weekly") -> "Summarize workspace changes"
        else -> "Customer briefing"
    }
    val baseCreatedMs = System.currentTimeMillis() - 12 * 60_000
    val isStreamingPreview = conversationId == "local-launch"
    return listOf(
        localPreviewUserMessage(
            sId = "$conversationId-user-1",
            rank = 0,
            createdMs = baseCreatedMs,
            content = "Can you help with \"$title\" and keep it concise?",
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-agent-1",
            rank = 1,
            createdMs = baseCreatedMs + 90_000,
            content = "I pulled together the relevant context and highlighted the main decisions, risks, and next steps.",
            generatedFiles = listOf(
                GeneratedFile(
                    fileId = "local-file-$conversationId-summary",
                    title = "Briefing summary.md",
                    contentType = "text/markdown",
                ),
                GeneratedFile(
                    fileId = "local-file-$conversationId-frame",
                    title = "Account briefing",
                    contentType = FRAME_CONTENT_TYPE_PREFIX,
                ),
            ),
        ),
        localPreviewUserMessage(
            sId = "$conversationId-user-2",
            rank = 2,
            createdMs = baseCreatedMs + 180_000,
            content = "Turn this into a short action list for the account team.",
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-agent-2",
            rank = 3,
            createdMs = baseCreatedMs + 270_000,
            content = if (isStreamingPreview) {
                "I grouped the open questions by owner and started drafting the launch follow-up."
            } else {
                "Action list: confirm the customer story, assign owners for the open risks, and send the briefing before the next account review."
            },
            status = if (isStreamingPreview) AgentMessageStatus.CREATED else AgentMessageStatus.SUCCEEDED,
            chainOfThought = if (isStreamingPreview) {
                "Checking the stakeholder notes for the latest owner updates and unresolved launch risks."
            } else {
                "Looked across the sample workspace notes and selected the most relevant items."
            },
        ),
    )
}

internal fun localPreviewReplyMessages(
    text: String,
    user: User,
    startRank: Int,
    conversationId: String,
): List<ConversationMessage> {
    val nowMs = System.currentTimeMillis()
    return listOf(
        localPreviewUserMessage(
            sId = "$conversationId-local-reply-user-$nowMs",
            rank = startRank,
            createdMs = nowMs,
            content = text.ifBlank { "Local attachment added." },
            user = user,
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-local-reply-agent-$nowMs",
            rank = startRank + 1,
            createdMs = nowMs + 1_000,
            content = "I drafted a concise response with the recommendation, open questions, and next steps ready for the account team.",
        ),
    )
}

internal fun localPreviewConversationFromDraft(
    text: String,
): Conversation {
    val nowMs = System.currentTimeMillis()
    return Conversation(
        sId = "local-created-$nowMs",
        created = nowMs.toDouble(),
        updated = nowMs.toDouble(),
        title = localPreviewConversationTitle(text),
        unread = false,
        actionRequired = false,
    )
}

internal fun localPreviewConversationTitle(text: String): String {
    val trimmed = text.trim()
    return when {
        trimmed.equals("Draft customer brief", ignoreCase = true) -> "Briefing"
        trimmed.contains("\"Customer briefing\"", ignoreCase = true) -> "Briefing"
        trimmed.equals("Summarize updates", ignoreCase = true) -> "Workspace summary"
        else -> trimmed.take(40).ifBlank { "Customer briefing" }
    }
}

internal fun localPreviewUserMessage(
    sId: String,
    rank: Int,
    createdMs: Long,
    content: String,
    user: User = localPreviewUser(),
): ConversationMessage.User =
    ConversationMessage.User(
        UserMessage(
            id = rank + 1,
            sId = sId,
            type = MessageType.USER,
            created = createdMs.toDouble(),
            visibility = "visible",
            version = 1,
            rank = rank,
            content = content,
            user = MessageUser(fullName = user.displayName, image = user.profilePictureUrl),
            context = UserMessageContext(
                fullName = user.displayName,
                email = user.email,
                profilePictureUrl = user.profilePictureUrl,
            ),
        ),
    )

internal fun localPreviewAgentMessage(
    sId: String,
    rank: Int,
    createdMs: Long,
    content: String,
    generatedFiles: List<GeneratedFile>? = null,
    status: AgentMessageStatus = AgentMessageStatus.SUCCEEDED,
    chainOfThought: String? = "Looked across the sample workspace notes and selected the most relevant items.",
): ConversationMessage.Agent =
    ConversationMessage.Agent(
        AgentMessage(
            sId = sId,
            type = MessageType.AGENT,
            created = createdMs.toDouble(),
            visibility = "visible",
            version = 1,
            rank = rank,
            status = status,
            content = content,
            chainOfThought = chainOfThought,
            configuration = AgentConfiguration(
                sId = DEFAULT_AGENT_CONFIGURATION_ID,
                name = "Dust",
                pictureUrl = DUST_AGENT_AVATAR_URL,
            ),
            generatedFiles = generatedFiles,
        ),
    )

internal fun localPreviewCompletedSteps(): List<ActivityStep> =
    listOf(
        ActivityStep.Thinking(
            id = "local-thinking",
            content = "Reviewed the latest account notes and selected the details relevant to the customer briefing.",
        ),
        ActivityStep.Action(
            id = "local-search",
            label = "Searched account notes",
            serverName = "Dust",
        ),
        ActivityStep.Action(
            id = "local-read",
            label = "Read customer context",
            serverName = "Google Drive",
        ),
    )
