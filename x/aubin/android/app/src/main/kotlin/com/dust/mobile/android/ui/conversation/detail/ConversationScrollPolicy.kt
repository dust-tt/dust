package com.dust.mobile.android.ui.conversation.detail

internal fun conversationBottomAnchorIndex(
    messageCount: Int,
    hasMore: Boolean,
    hasRefreshError: Boolean = false,
): Int? = if (messageCount > 0) {
    messageCount + (if (hasMore) 1 else 0) + (if (hasRefreshError) 1 else 0)
} else {
    null
}

internal fun conversationFollowAnchorIndex(
    previousLastMessageId: String?,
    lastMessageId: String?,
    previousBottomAnchorIndex: Int?,
    bottomAnchorIndex: Int,
): Int = if (
    previousLastMessageId != null &&
    previousLastMessageId != lastMessageId &&
    previousBottomAnchorIndex != null
) {
    previousBottomAnchorIndex
} else {
    bottomAnchorIndex
}

internal fun shouldFollowConversationBottom(
    hasPositionedInitialMessages: Boolean,
    lastVisibleItemIndex: Int?,
    bottomAnchorIndex: Int,
    lastVisibleItemEndOffset: Int?,
    viewportEndOffset: Int,
    followThresholdPx: Int,
): Boolean =
    !hasPositionedInitialMessages || isNearStreamingBottom(
        lastVisibleItemIndex = lastVisibleItemIndex,
        lastVisibleItemEndOffset = lastVisibleItemEndOffset,
        viewportEndOffset = viewportEndOffset,
        bottomAnchorIndex = bottomAnchorIndex,
        followThresholdPx = followThresholdPx,
    )

internal fun isNearStreamingBottom(
    lastVisibleItemIndex: Int?,
    lastVisibleItemEndOffset: Int?,
    viewportEndOffset: Int,
    bottomAnchorIndex: Int,
    followThresholdPx: Int,
): Boolean = lastVisibleItemIndex == null || (
    lastVisibleItemEndOffset != null &&
        lastVisibleItemIndex >= bottomAnchorIndex - 1 &&
        lastVisibleItemEndOffset <= viewportEndOffset + followThresholdPx
    )

internal fun streamingBottomScrollDelta(
    lastVisibleItemIndex: Int?,
    lastVisibleItemEndOffset: Int?,
    viewportEndOffset: Int,
    bottomAnchorIndex: Int,
    maxStepPx: Float,
): Float = when {
    lastVisibleItemIndex == null || lastVisibleItemEndOffset == null -> 0f
    lastVisibleItemIndex < bottomAnchorIndex - 1 -> 0f
    lastVisibleItemIndex < bottomAnchorIndex -> maxStepPx
    else -> (lastVisibleItemEndOffset - viewportEndOffset)
        .coerceAtLeast(0)
        .toFloat()
        .coerceAtMost(maxStepPx)
}
