package com.dust.mobile.android.ui.conversation.detail

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dust.mobile.core.model.ConversationMessage

internal fun conversationMessageTopSpacing(
    previousMessage: ConversationMessage?,
    message: ConversationMessage,
    hidesAgentHeader: Boolean,
): Dp = when {
    previousMessage == null -> 0.dp
    hidesAgentHeader -> 8.dp
    previousMessage is ConversationMessage.User && message is ConversationMessage.User -> 10.dp
    else -> 20.dp
}
