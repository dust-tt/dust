package com.dust.mobile.android.ui.message

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.isCurrentUserMessage
import com.dust.mobile.core.stream.AgentMessageStream
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
internal fun MessageBubble(
    message: ConversationMessage,
    currentUserEmail: String,
    currentUserSId: String? = null,
    lastError: ErrorInfo? = null,
    hideAgentHeader: Boolean = false,
    streamingActivity: AgentMessageStream.Activity? = null,
    activeActions: List<ActiveAction> = emptyList(),
    completedSteps: List<ActivityStep> = emptyList(),
    blockedState: BlockedState? = null,
    isValidatingAction: Boolean = false,
    actionError: String? = null,
    onOpenContentFragment: ((ContentFragment) -> Unit)? = null,
    loadContentFragmentImage: (suspend (String) -> ByteArray?)? = null,
    onOpenGeneratedFile: ((GeneratedFile) -> Unit)? = null,
    onOpenCitation: ((CitationReference) -> Unit)? = null,
    onRetryMessage: (String) -> Unit = {},
    onValidateAction: (ActionApproval) -> Unit = {},
    onAnswerQuestion: (UserQuestionAnswer) -> Unit = {},
    onOpenInBrowser: (() -> Unit)? = null,
) {
    Column(Modifier.fillMaxWidth()) {
        when (message) {
            is ConversationMessage.User -> UserMessageContent(
                message = message.message,
                isCurrentUser = isCurrentUserMessage(message.message, currentUserEmail),
                onOpenContentFragment = onOpenContentFragment,
                loadContentFragmentImage = loadContentFragmentImage,
            )
            is ConversationMessage.Agent -> AgentMessageContent(
                message = message.message,
                lastError = lastError,
                hideHeader = hideAgentHeader,
                streamingActivity = streamingActivity,
                activeActions = activeActions,
                completedSteps = completedSteps,
                blockedState = blockedState,
                isValidatingAction = isValidatingAction,
                actionError = actionError,
                onOpenGeneratedFile = onOpenGeneratedFile,
                onOpenCitation = onOpenCitation,
                onRetryMessage = onRetryMessage,
                onValidateAction = onValidateAction,
                onAnswerQuestion = onAnswerQuestion,
                onOpenInBrowser = onOpenInBrowser,
                currentUserSId = currentUserSId,
            )
        }
    }
}

@Composable
private fun UserMessageContent(
    message: com.dust.mobile.core.model.UserMessage,
    isCurrentUser: Boolean,
    onOpenContentFragment: ((ContentFragment) -> Unit)?,
    loadContentFragmentImage: (suspend (String) -> ByteArray?)?,
) {
    val timestamp = remember(message.created) { formatMessageTimestamp(message.created) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (message.isPending) 0.5f else 1f),
        horizontalAlignment = if (isCurrentUser) Alignment.End else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(DustSpacing.small),
    ) {
        if (!isCurrentUser) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DustAvatar(
                    name = message.authorName,
                    avatarUrl = message.authorAvatarUrl,
                    size = 28.dp,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        message.authorName ?: "User",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    MessageTimestamp(timestamp)
                }
            }
        }
        ContentFragmentChips(
            fragments = message.contentFragments.orEmpty(),
            onOpen = onOpenContentFragment,
            loadImage = loadContentFragmentImage,
        )
        if (message.content.isNotBlank()) {
            if (isCurrentUser) {
                DustMarkdownText(
                    message.content,
                    selectable = true,
                    modifier = Modifier
                        .widthIn(max = 320.dp)
                        .background(
                            MaterialTheme.colorScheme.interactiveSurface,
                            RoundedCornerShape(DustRadii.messageBubble),
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                )
            } else {
                DustMarkdownText(message.content, selectable = true)
            }
        }
    }
}

@Composable
internal fun MessageTimestamp(timestamp: String, modifier: Modifier = Modifier) {
    if (timestamp.isNotEmpty()) {
        Text(
            timestamp,
            modifier = modifier,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f),
            fontWeight = FontWeight.Normal,
        )
    }
}

internal fun formatMessageTimestamp(
    created: Double,
    zoneId: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): String {
    if (!created.isFinite() || created <= 0) return ""
    val epochMillis = if (created < 100_000_000_000) created * 1_000 else created
    return runCatching {
        DateTimeFormatter
            .ofLocalizedTime(FormatStyle.SHORT)
            .withLocale(locale)
            .withZone(zoneId)
            .format(Instant.ofEpochMilli(epochMillis.toLong()))
    }.getOrDefault("")
}
