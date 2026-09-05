package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.CatchUpMessagesSkeleton
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.message.MessageBubble
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.GeneratedFile

@Composable
internal fun CatchUpConversationCard(
    conversation: Conversation,
    messages: List<ConversationMessage>,
    currentUserEmail: String,
    isLoading: Boolean,
    dragOffsetPx: Float,
    isEnabled: Boolean,
    onDrag: (Float) -> Unit,
    onDragCancelled: () -> Unit,
    onDragEnded: () -> Unit,
    onOpenConversation: () -> Unit,
    onOpenContentFragment: (ContentFragment) -> Unit,
    onOpenFile: (GeneratedFile) -> Unit,
    onOpenCitation: (CitationReference) -> Unit,
) {
    val density = LocalDensity.current
    val swipeHintPx = with(density) { CATCH_UP_SWIPE_HINT_DP.dp.toPx() }
    val swipeThresholdPx = with(density) { CATCH_UP_SWIPE_THRESHOLD_DP.dp.toPx() }
    val rotationDegrees = (with(density) { dragOffsetPx.toDp().value } / 42f).coerceIn(-6f, 6f)
    val cardShape = RoundedCornerShape(8.dp)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        CatchUpSwipeHint(
            dragOffsetPx = dragOffsetPx,
            hintStartPx = swipeHintPx,
            commitThresholdPx = swipeThresholdPx,
            actionRequired = conversation.actionRequired,
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    translationX = dragOffsetPx
                    rotationZ = rotationDegrees
                },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .shadow(2.dp, cardShape)
                    .clip(cardShape)
                    .background(MaterialTheme.colorScheme.surface, cardShape)
                    .border(1.dp, MaterialTheme.colorScheme.subtleBorder, cardShape)
                    .pointerInput(conversation.sId, isEnabled, swipeThresholdPx) {
                        if (isEnabled) {
                            detectHorizontalDragGestures(
                                onDragCancel = onDragCancelled,
                                onDragEnd = onDragEnded,
                                onHorizontalDrag = { _, dragAmount -> onDrag(dragAmount) },
                            )
                        }
                    },
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(enabled = isEnabled, onClick = onOpenConversation)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ConversationStatusDot(conversation)
                    Text(
                        conversation.title ?: "New conversation",
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Icon(
                        painter = painterResource(R.drawable.ic_chevron_right_24),
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
                ContentCrossfade(
                    targetState = isLoading,
                    label = "catch-up-messages-loading",
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                ) { loading ->
                    if (loading) {
                        CatchUpMessagesSkeleton()
                    } else when {
                        messages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No messages")
                        }
                        else -> LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(
                                start = 16.dp,
                                top = 12.dp,
                                end = 16.dp,
                                bottom = 12.dp,
                            ),
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                        ) {
                            items(messages, key = { it.id }) { message ->
                                MessageBubble(
                                    message = message,
                                    currentUserEmail = currentUserEmail,
                                    onOpenContentFragment = onOpenContentFragment,
                                    onOpenGeneratedFile = onOpenFile,
                                    onOpenCitation = onOpenCitation,
                                )
                            }
                            if (conversation.actionRequired) {
                                item {
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
                                        Row(
                                            modifier = Modifier.padding(horizontal = 2.dp),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Box(
                                                Modifier
                                                    .size(8.dp)
                                                    .background(MaterialTheme.colorScheme.tertiary, CircleShape),
                                            )
                                            Text(
                                                "This conversation needs your action. Open it to respond.",
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                style = MaterialTheme.typography.bodySmall,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CatchUpSwipeHint(
    dragOffsetPx: Float,
    hintStartPx: Float,
    commitThresholdPx: Float,
    actionRequired: Boolean,
) {
    val isMarkAsRead = dragOffsetPx > hintStartPx
    val isKeepForLater = dragOffsetPx < -hintStartPx
    if (!isMarkAsRead && !isKeepForLater) return

    val progress = ((kotlin.math.abs(dragOffsetPx) - hintStartPx) / (commitThresholdPx - hintStartPx))
        .coerceIn(0f, 1f)
    val color = if (isMarkAsRead) {
        MaterialTheme.colorScheme.action
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(color.copy(alpha = progress * 0.12f), RoundedCornerShape(8.dp))
            .padding(horizontal = 28.dp),
        contentAlignment = if (isMarkAsRead) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        Column(
            modifier = Modifier.alpha(progress),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                painter = painterResource(
                    when {
                        isMarkAsRead && actionRequired -> R.drawable.ic_chevron_right_24
                        isMarkAsRead -> R.drawable.ic_check_24
                        else -> R.drawable.ic_clock_24
                    },
                ),
                contentDescription = null,
                modifier = Modifier.size(26.dp),
                tint = color,
            )
            Text(
                when {
                    isMarkAsRead && actionRequired -> "Respond"
                    isMarkAsRead -> "Mark as read"
                    else -> "Keep for later"
                },
                color = color,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}
