package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.activeStatusPulse
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.Conversation

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationRow(
    conversation: Conversation,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    showActions: Boolean = true,
    supportingText: String? = null,
    podName: String? = null,
    onToggleRead: () -> Unit,
    onDelete: () -> Unit,
) {
    val presentation = remember(conversation, podName) {
        conversationRowPresentation(conversation = conversation, podName = podName)
    }
    if (!showActions) {
        ConversationRowContent(
            conversation = conversation,
            presentation = presentation,
            onOpen = onOpen,
            supportingText = supportingText,
            modifier = modifier,
        )
        return
    }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onToggleRead()
                SwipeToDismissBoxValue.EndToStart -> onDelete()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )

    SwipeToDismissBox(
        modifier = modifier,
        state = dismissState,
        backgroundContent = {
            ConversationRowSwipeBackground(
                direction = dismissState.dismissDirection,
                markReadLabel = if (conversation.unread || conversation.actionRequired) {
                    "Mark read"
                } else {
                    "Mark unread"
                },
            )
        },
    ) {
        ConversationRowContent(
            conversation = conversation,
            presentation = presentation,
            onOpen = onOpen,
            supportingText = supportingText,
        )
    }
}

@Composable
private fun ConversationRowContent(
    conversation: Conversation,
    presentation: ConversationRowPresentation,
    onOpen: () -> Unit,
    supportingText: String?,
    modifier: Modifier = Modifier,
) {
    val iconColor = conversationStatusColor(presentation.status)
    val rowStateDescription = when (presentation.status) {
        ConversationRowStatus.ACTION_REQUIRED -> "Action required"
        ConversationRowStatus.ERROR -> "Needs review"
        ConversationRowStatus.RUNNING -> "Agent working"
        ConversationRowStatus.UNREAD -> "Unread"
        ConversationRowStatus.SCHEDULED -> "Scheduled"
        ConversationRowStatus.AUTOMATED -> "Automated"
        ConversationRowStatus.IDLE -> "Read"
    }
    val secondaryText = supportingText?.takeIf { it.isNotBlank() } ?: presentation.context

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onOpen)
            .semantics(mergeDescendants = true) {
                stateDescription = rowStateDescription
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = DustDimensions.conversationRowMinimumHeight)
                .padding(
                    start = DustDimensions.pageHorizontalPadding,
                    end = DustDimensions.pageHorizontalPadding,
                    top = 6.dp,
                    bottom = 6.dp,
                ),
            horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ConversationRowStatusIndicator(
                status = presentation.status,
                color = iconColor,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                Text(
                    conversation.title ?: "New conversation",
                    fontWeight = if (presentation.isEmphasized) FontWeight.SemiBold else FontWeight.Normal,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                secondaryText?.let { description ->
                    Text(
                        text = description,
                        color = if (supportingText == null && presentation.isEmphasized) {
                            iconColor
                        } else {
                            MaterialTheme.colorScheme.contentMuted
                        },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Text(
                text = presentation.updatedLabel,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.contentMuted,
                maxLines = 1,
            )
        }
        HorizontalDivider(
            modifier = Modifier.padding(
                start = ROW_DIVIDER_INSET,
                end = DustDimensions.pageHorizontalPadding,
            ),
            color = MaterialTheme.colorScheme.subtleBorder.copy(alpha = 0.72f),
        )
    }
}

@Composable
private fun ConversationRowStatusIndicator(
    status: ConversationRowStatus,
    color: Color,
) {
    Box(
        modifier = Modifier.width(ROW_STATUS_RAIL_WIDTH),
        contentAlignment = Alignment.Center,
    ) {
        if (status == ConversationRowStatus.UNREAD) {
            Box(
                Modifier
                    .size(7.dp)
                    .background(color, CircleShape),
            )
            return@Box
        }
        conversationStatusIcon(status)?.let { iconRes ->
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier
                    .size(DustDimensions.inlineIcon)
                    .activeStatusPulse(status == ConversationRowStatus.RUNNING),
                tint = color,
            )
        }
    }
}

private fun conversationStatusIcon(status: ConversationRowStatus): Int? = when (status) {
    ConversationRowStatus.ACTION_REQUIRED -> R.drawable.ic_alert_circle_24
    ConversationRowStatus.ERROR -> R.drawable.ic_warning_24
    ConversationRowStatus.RUNNING -> R.drawable.ic_thinking_24
    ConversationRowStatus.UNREAD,
    ConversationRowStatus.IDLE,
    -> null
    ConversationRowStatus.SCHEDULED -> R.drawable.ic_schedule_24
    ConversationRowStatus.AUTOMATED -> R.drawable.ic_automation_24
}

private val ROW_STATUS_RAIL_WIDTH = 20.dp
private val ROW_DIVIDER_INSET =
    DustDimensions.pageHorizontalPadding + ROW_STATUS_RAIL_WIDTH + DustSpacing.small

@Composable
private fun conversationStatusColor(status: ConversationRowStatus): Color = when (status) {
    ConversationRowStatus.ACTION_REQUIRED -> MaterialTheme.colorScheme.tertiary
    ConversationRowStatus.ERROR -> MaterialTheme.colorScheme.error
    ConversationRowStatus.RUNNING,
    ConversationRowStatus.UNREAD,
    -> MaterialTheme.colorScheme.action
    ConversationRowStatus.SCHEDULED,
    ConversationRowStatus.AUTOMATED,
    ConversationRowStatus.IDLE,
    -> MaterialTheme.colorScheme.contentMuted
}

@Composable
internal fun ConversationStatusDot(
    conversation: Conversation,
    modifier: Modifier = Modifier,
) {
    val color = when {
        conversation.actionRequired -> MaterialTheme.colorScheme.tertiary
        conversation.unread -> MaterialTheme.colorScheme.action
        else -> return
    }
    Box(
        modifier = modifier
            .size(6.dp)
            .background(color, CircleShape),
    )
}
