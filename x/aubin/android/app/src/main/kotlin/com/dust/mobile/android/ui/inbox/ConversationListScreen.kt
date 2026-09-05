package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.quicksettings.rememberQuickSettingsTilePinAction
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.android.widget.rememberCatchUpWidgetPinAction
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace

@Composable
internal fun ConversationListScreen(
    state: ConversationListState,
    searchFocusRequestId: Int = 0,
    user: User,
    isLocalPreview: Boolean,
    onSearch: (String) -> Unit,
    onSwitchWorkspace: (Workspace) -> Unit,
    onLogout: () -> Unit,
    notificationsAvailable: Boolean,
    notificationsEnabled: Boolean,
    onManageNotifications: () -> Unit,
    systemSearchAvailable: Boolean,
    onSystemSearchChange: (Boolean) -> Unit,
    onNewConversation: () -> Unit,
    onSelectPod: (Space) -> Unit,
    onTogglePodsExpanded: () -> Unit,
    onSelectConversation: (Conversation) -> Unit,
    onToggleRead: (Conversation) -> Unit,
    onDelete: (Conversation) -> Unit,
    onCatchUp: (() -> Unit)?,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit = {},
    onRetrySearch: () -> Unit = {},
    onDismissActionError: () -> Unit = {},
) {
    var conversationToDelete by remember { mutableStateOf<Conversation?>(null) }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val widgetPinAction = rememberCatchUpWidgetPinAction()
    val quickSettingsPinAction = rememberQuickSettingsTilePinAction()

    fun requestDelete(conversation: Conversation) {
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
        conversationToDelete = conversation
    }

    conversationToDelete?.let { conversation ->
        AlertDialog(
            onDismissRequest = { conversationToDelete = null },
            title = { Text("Delete conversation?") },
            text = { Text("This action cannot be undone.") },
            confirmButton = {
                DustButton(
                    label = "Delete",
                    onClick = {
                        conversationToDelete = null
                        onDelete(conversation)
                    },
                    variant = DustButtonVariant.DestructiveText,
                )
            },
            dismissButton = {
                DustButton(
                    label = "Cancel",
                    onClick = { conversationToDelete = null },
                    variant = DustButtonVariant.Text,
                )
            },
        )
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding(),
    ) {
        ConversationRootHeader(
            user = user,
            isLocalPreview = isLocalPreview,
            currentWorkspace = state.workspace,
            workspaces = state.workspaces,
            onSwitchWorkspace = onSwitchWorkspace,
            onLogout = onLogout,
            notificationsAvailable = notificationsAvailable,
            notificationsEnabled = notificationsEnabled,
            onManageNotifications = onManageNotifications,
            onAddWidget = widgetPinAction.request.takeIf { widgetPinAction.isSupported && !isLocalPreview },
            onAddQuickSettingsTile = quickSettingsPinAction.request.takeIf {
                quickSettingsPinAction.isSupported && !isLocalPreview
            },
            systemSearchAvailable = systemSearchAvailable && !isLocalPreview,
            systemSearchEnabled = state.systemSearchEnabled,
            onSystemSearchChange = onSystemSearchChange,
            onRefresh = onRefresh,
        )
        ConversationListContent(
            modifier = Modifier.weight(1f),
            state = state,
            onSelectPod = onSelectPod,
            onTogglePodsExpanded = onTogglePodsExpanded,
            onSelectConversation = onSelectConversation,
            onToggleRead = onToggleRead,
            onDelete = ::requestDelete,
            onCatchUp = onCatchUp,
            onRefresh = onRefresh,
            onLoadMore = onLoadMore,
            onRetrySearch = onRetrySearch,
        )
        state.actionError?.let { message ->
            Snackbar(action = {
                DustButton(label = "Dismiss", onClick = onDismissActionError, variant = DustButtonVariant.Text)
            }) { Text(message) }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
        ConversationListCommandBar(
            searchText = state.searchText,
            focusRequestId = searchFocusRequestId,
            onSearch = onSearch,
            onNewConversation = onNewConversation,
        )
    }
}
