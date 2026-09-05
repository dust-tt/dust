package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import kotlin.math.min

data class CatchUpState(
    val conversations: List<Conversation>,
    val currentIndex: Int = 0,
    val messages: List<ConversationMessage> = emptyList(),
    val markedAsReadIds: Set<String> = emptySet(),
    val isLoadingMessages: Boolean = false,
    val isFlushing: Boolean = false,
    val hasFlushed: Boolean = false,
    val error: String? = null,
    val saveError: String? = null,
) {
    val currentConversation: Conversation?
        get() = conversations.getOrNull(currentIndex)

    val isDone: Boolean
        get() = currentIndex >= conversations.size

    val keptForLaterCount: Int
        get() = currentIndex - markedAsReadIds.size

    val progressText: String
        get() {
            if (conversations.isEmpty()) return "0 of 0"
            return "${min(currentIndex + 1, conversations.size)} of ${conversations.size}"
    }
}

internal fun CatchUpState.canStartFlush(): Boolean =
    !hasFlushed && !isFlushing && markedAsReadIds.isNotEmpty()

internal fun CatchUpState.flushStarted(): CatchUpState =
    copy(isFlushing = true, saveError = null)

internal fun CatchUpState.flushSucceeded(): CatchUpState =
    copy(isFlushing = false, hasFlushed = true, saveError = null)

internal fun CatchUpState.flushFailed(error: String): CatchUpState =
    copy(
        isFlushing = false,
        hasFlushed = false,
        saveError = error,
    )

