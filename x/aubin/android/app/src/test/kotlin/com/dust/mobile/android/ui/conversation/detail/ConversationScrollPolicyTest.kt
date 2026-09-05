package com.dust.mobile.android.ui.conversation.detail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationScrollPolicyTest {
    @Test
    fun `bottom anchor accounts for the older messages row`() {
        assertNull(conversationBottomAnchorIndex(messageCount = 0, hasMore = false))
        assertEquals(3, conversationBottomAnchorIndex(messageCount = 3, hasMore = false))
        assertEquals(4, conversationBottomAnchorIndex(messageCount = 3, hasMore = true))
    }

    @Test
    fun `bottom anchor includes the saved content notice and pagination`() {
        assertEquals(4, conversationBottomAnchorIndex(3, hasMore = false, hasRefreshError = true))
        assertEquals(5, conversationBottomAnchorIndex(3, hasMore = true, hasRefreshError = true))
    }

    @Test
    fun `reading the middle of the final long response does not follow new messages`() {
        assertFalse(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = true,
                lastVisibleItemIndex = 19,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 3_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
    }

    @Test
    fun `message appends use the previous tail to preserve bottom follow intent`() {
        assertEquals(
            8,
            conversationFollowAnchorIndex(
                previousLastMessageId = "message-8",
                lastMessageId = "message-10",
                previousBottomAnchorIndex = 8,
                bottomAnchorIndex = 10,
            ),
        )
        assertEquals(
            10,
            conversationFollowAnchorIndex(
                previousLastMessageId = "message-10",
                lastMessageId = "message-10",
                previousBottomAnchorIndex = 8,
                bottomAnchorIndex = 10,
            ),
        )
    }

    @Test
    fun `new messages follow only from the initial or bottom position`() {
        assertTrue(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = false,
                lastVisibleItemIndex = 0,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
        assertTrue(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = true,
                lastVisibleItemIndex = 19,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
        assertFalse(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = true,
                lastVisibleItemIndex = 8,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
    }

    @Test
    fun `unknown viewport follows but earlier messages do not`() {
        assertTrue(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = true,
                lastVisibleItemIndex = null,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
        assertFalse(
            shouldFollowConversationBottom(
                hasPositionedInitialMessages = true,
                lastVisibleItemIndex = 18,
                bottomAnchorIndex = 20,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                followThresholdPx = 96,
            ),
        )
    }

    @Test
    fun `streaming follow only stays active near the bottom`() {
        assertTrue(
            isNearStreamingBottom(
                lastVisibleItemIndex = 19,
                lastVisibleItemEndOffset = 1_096,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                followThresholdPx = 96,
            ),
        )
        assertFalse(
            isNearStreamingBottom(
                lastVisibleItemIndex = 19,
                lastVisibleItemEndOffset = 1_097,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                followThresholdPx = 96,
            ),
        )
        assertFalse(
            isNearStreamingBottom(
                lastVisibleItemIndex = 18,
                lastVisibleItemEndOffset = 1_000,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                followThresholdPx = 96,
            ),
        )
    }

    @Test
    fun `streaming follow advances in bounded visual steps`() {
        assertEquals(
            48f,
            streamingBottomScrollDelta(
                lastVisibleItemIndex = 19,
                lastVisibleItemEndOffset = 990,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                maxStepPx = 48f,
            ),
        )
        assertEquals(
            20f,
            streamingBottomScrollDelta(
                lastVisibleItemIndex = 20,
                lastVisibleItemEndOffset = 1_020,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                maxStepPx = 48f,
            ),
        )
        assertEquals(
            0f,
            streamingBottomScrollDelta(
                lastVisibleItemIndex = 20,
                lastVisibleItemEndOffset = 990,
                viewportEndOffset = 1_000,
                bottomAnchorIndex = 20,
                maxStepPx = 48f,
            ),
        )
    }
}
