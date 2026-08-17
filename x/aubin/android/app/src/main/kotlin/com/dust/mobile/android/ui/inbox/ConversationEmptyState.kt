package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.theme.DustSpacing

@Composable
internal fun ConversationEmptyState(
    label: String,
    supportingLabel: String?,
    modifier: Modifier = Modifier,
) {
    DustFeedbackState(
        iconRes = R.drawable.ic_chat_24,
        title = label,
        message = supportingLabel,
        modifier = modifier.padding(vertical = DustSpacing.huge),
    )
}

internal fun conversationListEmptyLabel(searchText: String): String =
    if (searchText.isEmpty()) {
        "No conversations yet"
    } else {
        "No results for \"$searchText\""
    }

internal fun podConversationListEmptyLabel(searchText: String): String =
    if (searchText.isEmpty()) {
        "No conversations yet"
    } else {
        "No matching conversations"
    }
