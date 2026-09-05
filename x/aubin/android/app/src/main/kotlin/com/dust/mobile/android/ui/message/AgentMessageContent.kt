package com.dust.mobile.android.ui.message

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.activeCitationEntries
import com.dust.mobile.core.model.displayableGeneratedFiles
import com.dust.mobile.core.model.renderAgentMessage
import com.dust.mobile.core.stream.AgentMessageStream

@Composable
internal fun AgentMessageContent(
    message: AgentMessage,
    lastError: ErrorInfo?,
    hideHeader: Boolean,
    streamingActivity: AgentMessageStream.Activity?,
    activeActions: List<ActiveAction>,
    completedSteps: List<ActivityStep>,
    blockedState: BlockedState?,
    isValidatingAction: Boolean,
    actionError: String?,
    onOpenGeneratedFile: ((GeneratedFile) -> Unit)?,
    onOpenCitation: ((CitationReference) -> Unit)?,
    onRetryMessage: (String) -> Unit,
    onValidateAction: (ActionApproval) -> Unit,
    onAnswerQuestion: (UserQuestionAnswer) -> Unit,
    onOpenInBrowser: (() -> Unit)?,
    currentUserSId: String?,
) {
    val rawContent = message.content.orEmpty()
    val visibleContent = rememberStreamingText(
        streamKey = message.sId,
        text = rawContent,
        isStreaming = message.isStreaming,
    )
    val rendered = remember(rawContent) { renderAgentMessage(rawContent) }
    val showActivity = completedSteps.isNotEmpty() ||
        activeActions.isNotEmpty() ||
        !message.chainOfThought.isNullOrBlank() ||
        (message.isStreaming && rawContent.isBlank())
    if (!hideHeader) {
        val timestamp = remember(message.created) { formatMessageTimestamp(message.created) }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DustAvatar(
                name = message.configuration.name,
                avatarUrl = message.configuration.pictureUrl,
                size = 26.dp,
                isAgent = true,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    agentHandle(message.configuration.name),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                MessageTimestamp(timestamp)
            }
        }
        if (showActivity || rendered.displayText.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
        }
    }
    Column(Modifier.padding(start = 34.dp)) {
        if (showActivity) {
            ActivityTimeline(
                activity = streamingActivity,
                chainOfThought = message.chainOfThought,
                completedSteps = completedSteps,
                activeActions = activeActions,
                isStreaming = message.isStreaming,
                isBlocking = blockedState != null,
            )
        }
        if (message.isStreaming) {
            StreamingMarkdownText(
                targetContent = rawContent,
                visibleContent = visibleContent,
            )
        } else if (rendered.displayText.isNotBlank()) {
            DustMarkdownText(rendered.displayText, selectable = true)
        }
        val files = displayableGeneratedFiles(message)
        if (files.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            GeneratedFileChips(files = files, onOpen = onOpenGeneratedFile)
        }
        val activeCitations = remember(rendered.citeMapping, message.citations) {
            activeCitationEntries(rendered.citeMapping, message.citations)
        }
        if (!message.isStreaming && activeCitations.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            CitationSection(entries = activeCitations, onOpen = onOpenCitation)
        }
        if (message.isStreaming && blockedState != null) {
            Spacer(Modifier.height(8.dp))
            BlockedActionCard(
                blockedState = blockedState,
                isLoading = isValidatingAction,
                error = actionError,
                onValidate = onValidateAction,
                onAnswer = onAnswerQuestion,
                onOpenInBrowser = onOpenInBrowser,
                currentUserSId = currentUserSId,
            )
        }
        val errorInfo = lastError ?: remember(message.error, message.sId) {
            message.error?.let { ErrorInfo.from(it, message.sId) }
        }
        if (message.status == AgentMessageStatus.FAILED && errorInfo != null) {
            Spacer(Modifier.height(8.dp))
            ErrorCard(error = errorInfo, onRetry = { onRetryMessage(message.sId) })
        }
        if (!message.isStreaming && rendered.displayText.isNotBlank()) {
            MessageResponseActions(content = rendered.displayText)
        }
    }
}

internal fun agentHandle(name: String): String {
    val trimmed = name.trim().ifBlank { "Agent" }
    return if (trimmed.startsWith('@')) trimmed else "@$trimmed"
}
