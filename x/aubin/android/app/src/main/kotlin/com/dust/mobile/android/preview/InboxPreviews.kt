package com.dust.mobile.android.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.dust.mobile.android.ui.inbox.ConversationListScreen
import com.dust.mobile.android.ui.inbox.ConversationRow
import com.dust.mobile.android.ui.preview.DustComponentPreviews
import com.dust.mobile.android.ui.preview.DustScreenPreviews
import com.dust.mobile.android.ui.preview.localPreviewUser
import com.dust.mobile.android.ui.theme.DustTheme

@DustScreenPreviews
@Composable
private fun InboxPreview() {
    DustTheme {
        ConversationListScreen(
            state = previewInboxState(),
            user = localPreviewUser(),
            isLocalPreview = true,
            onSearch = {},
            onSwitchWorkspace = {},
            onLogout = {},
            notificationsAvailable = true,
            notificationsEnabled = true,
            onManageNotifications = {},
            systemSearchAvailable = true,
            onSystemSearchChange = {},
            onNewConversation = {},
            onSelectPod = {},
            onTogglePodsExpanded = {},
            onSelectConversation = {},
            onToggleRead = {},
            onDelete = {},
            onCatchUp = {},
            onRefresh = {},
        )
    }
}

@DustComponentPreviews
@Composable
private fun ConversationRowStatesPreview() {
    DustTheme {
        Column(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background),
        ) {
            previewConversationStates().forEach { conversation ->
                ConversationRow(
                    conversation = conversation,
                    podName = when (conversation.spaceId) {
                        "local-pod-customers" -> "Customer Ops"
                        "local-pod-mobile" -> "Launch Planning"
                        else -> null
                    },
                    showActions = false,
                    onOpen = {},
                    onToggleRead = {},
                    onDelete = {},
                )
            }
        }
    }
}
