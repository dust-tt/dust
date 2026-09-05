package com.dust.mobile.android.ui.conversation.detail

import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.motionEnabled
import kotlinx.coroutines.isActive

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ConversationScrollEffects(
    conversationId: String,
    messageCount: Int,
    lastMessageId: String?,
    hasMore: Boolean,
    hasRefreshError: Boolean = false,
    streamingMessageId: String?,
    isComposerFocused: Boolean,
    isSending: Boolean,
    listState: LazyListState,
    onUserScroll: () -> Unit,
) {
    var hasPositionedInitialMessages by remember(conversationId) { mutableStateOf(false) }
    var shouldAnchorOnImeOpen by remember(conversationId) { mutableStateOf(false) }
    var pendingSendFollow by remember(conversationId) { mutableStateOf(false) }
    var previousLastMessageId by remember(conversationId) { mutableStateOf<String?>(null) }
    var previousBottomAnchorIndex by remember(conversationId) { mutableStateOf<Int?>(null) }
    val isImeVisible = WindowInsets.isImeVisible
    val isUserDragging by listState.interactionSource.collectIsDraggedAsState()
    val streamingBottomFollowThresholdPx = with(LocalDensity.current) {
        STREAMING_BOTTOM_FOLLOW_THRESHOLD_DP.dp.roundToPx()
    }
    val streamingScrollStepPx = with(LocalDensity.current) {
        STREAMING_SCROLL_STEP_DP.dp.toPx()
    }
    val shouldAnimateStreamingScroll = motionEnabled()

    LaunchedEffect(isUserDragging) {
        if (isUserDragging) {
            onUserScroll()
        }
    }

    LaunchedEffect(lastMessageId, messageCount, hasMore, hasRefreshError, isSending) {
        if (isSending) {
            pendingSendFollow = true
        }
        val bottomAnchorIndex = conversationBottomAnchorIndex(messageCount, hasMore, hasRefreshError)
            ?: return@LaunchedEffect
        val followAnchorIndex = conversationFollowAnchorIndex(
            previousLastMessageId = previousLastMessageId,
            lastMessageId = lastMessageId,
            previousBottomAnchorIndex = previousBottomAnchorIndex,
            bottomAnchorIndex = bottomAnchorIndex,
        )
        // A new message takes the old bottom spacer's index. Measure the previous
        // final message so the new response's height cannot disable following.
        val followItem = listState.layoutInfo.visibleItemsInfo.lastOrNull { it.index < followAnchorIndex }
        val shouldFollow = pendingSendFollow || shouldFollowConversationBottom(
            hasPositionedInitialMessages = hasPositionedInitialMessages,
            lastVisibleItemIndex = followItem?.index,
            bottomAnchorIndex = followAnchorIndex,
            lastVisibleItemEndOffset = followItem?.let {
                it.offset + it.size
            },
            viewportEndOffset = listState.layoutInfo.viewportEndOffset,
            followThresholdPx = streamingBottomFollowThresholdPx,
        )
        previousLastMessageId = lastMessageId
        previousBottomAnchorIndex = bottomAnchorIndex
        repeat(2) { withFrameNanos { } }
        if (shouldFollow && !listState.isScrollInProgress) {
            listState.scrollToItem(bottomAnchorIndex)
            pendingSendFollow = isSending
        }
        hasPositionedInitialMessages = true
    }
    LaunchedEffect(isComposerFocused) {
        if (!isComposerFocused) {
            shouldAnchorOnImeOpen = false
            return@LaunchedEffect
        }
        val bottomAnchorIndex = conversationBottomAnchorIndex(messageCount, hasMore, hasRefreshError)
            ?: return@LaunchedEffect
        shouldAnchorOnImeOpen = shouldFollowConversationBottom(
            hasPositionedInitialMessages = hasPositionedInitialMessages,
            lastVisibleItemIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index,
            bottomAnchorIndex = bottomAnchorIndex,
            lastVisibleItemEndOffset = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.let {
                it.offset + it.size
            },
            viewportEndOffset = listState.layoutInfo.viewportEndOffset,
            followThresholdPx = streamingBottomFollowThresholdPx,
        )
    }
    LaunchedEffect(isImeVisible, isComposerFocused, shouldAnchorOnImeOpen) {
        if (isImeVisible && isComposerFocused && shouldAnchorOnImeOpen) {
            repeat(2) { withFrameNanos { } }
            val bottomAnchorIndex = conversationBottomAnchorIndex(messageCount, hasMore, hasRefreshError)
                ?: return@LaunchedEffect
            if (!listState.isScrollInProgress) {
                listState.scrollToItem(bottomAnchorIndex)
            }
            shouldAnchorOnImeOpen = false
        }
    }
    LaunchedEffect(streamingMessageId, messageCount, hasMore, hasRefreshError) {
        if (streamingMessageId == null) return@LaunchedEffect
        val bottomAnchorIndex = conversationBottomAnchorIndex(messageCount, hasMore, hasRefreshError)
            ?: return@LaunchedEffect
        while (isActive) {
            val layoutInfo = listState.layoutInfo
            val lastVisibleItem = layoutInfo.visibleItemsInfo.lastOrNull()
            val wasNearBottom = isNearStreamingBottom(
                lastVisibleItemIndex = lastVisibleItem?.index,
                lastVisibleItemEndOffset = lastVisibleItem?.let { it.offset + it.size },
                viewportEndOffset = layoutInfo.viewportEndOffset,
                bottomAnchorIndex = bottomAnchorIndex,
                followThresholdPx = streamingBottomFollowThresholdPx,
            )
            withFrameNanos { }
            if (wasNearBottom && !listState.isScrollInProgress) {
                if (shouldAnimateStreamingScroll) {
                    val updatedLayoutInfo = listState.layoutInfo
                    val updatedLastVisibleItem = updatedLayoutInfo.visibleItemsInfo.lastOrNull()
                    val delta = streamingBottomScrollDelta(
                        lastVisibleItemIndex = updatedLastVisibleItem?.index,
                        lastVisibleItemEndOffset = updatedLastVisibleItem?.let {
                            it.offset + it.size
                        },
                        viewportEndOffset = updatedLayoutInfo.viewportEndOffset,
                        bottomAnchorIndex = bottomAnchorIndex,
                        maxStepPx = streamingScrollStepPx,
                    )
                    if (delta > 0f) {
                        listState.scrollBy(delta)
                    }
                } else {
                    listState.scrollToItem(bottomAnchorIndex)
                }
            }
        }
    }
}

private const val STREAMING_BOTTOM_FOLLOW_THRESHOLD_DP = 96
private const val STREAMING_SCROLL_STEP_DP = 24
