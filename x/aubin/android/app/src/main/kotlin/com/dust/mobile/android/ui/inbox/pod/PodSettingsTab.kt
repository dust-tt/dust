package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustSectionHeader
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.displayLabel

@Composable
internal fun PodSettingsTab(
    state: PodState,
    onUpdateNotification: (PodNotificationCondition) -> Unit,
    onUpdateTaskSuggestions: (Boolean) -> Unit,
    onOpenAdvancedSettings: () -> Unit,
    notificationsAvailable: Boolean,
    notificationsEnabled: Boolean,
    onManageNotifications: () -> Unit,
    onRetry: () -> Unit,
) {
    val details = state.details ?: return
    var showMembers by remember { mutableStateOf(false) }
    var showNotifications by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = DustSpacing.extraLarge),
    ) {
        item { DustSectionHeader(label = "Pod") }
        item {
            PodSettingsRow(
                iconRes = R.drawable.ic_document_24,
                title = "Description",
                supportingText = details.description?.takeIf { it.isNotBlank() } ?: "No description",
            )
        }
        item {
            PodSettingsRow(
                iconRes = if (details.isRestricted) R.drawable.ic_lock_24 else R.drawable.ic_space_open_24,
                title = "Access",
                supportingText = if (details.isRestricted) {
                    "Restricted to invited members"
                } else {
                    "Open to everyone in the workspace"
                },
            )
        }
        item {
            PodSettingsRow(
                iconRes = R.drawable.ic_group_24,
                title = "Members",
                supportingText = "${details.members.size} ${if (details.members.size == 1) "member" else "members"}",
                onClick = { showMembers = true },
            )
        }
        item { DustSectionHeader(label = "Preferences") }
        item {
            val preference = state.notificationPreference?.preference
            PodSettingsRow(
                iconRes = R.drawable.ic_notifications_24,
                title = "Notifications",
                supportingText = when {
                    state.isNotificationLoading -> "Loading"
                    state.notificationError != null -> "Unavailable, tap to retry"
                    preference != null -> buildString {
                        append(preference.displayLabel())
                        if (
                            notificationsAvailable &&
                            !notificationsEnabled &&
                            preference != PodNotificationCondition.NEVER
                        ) {
                            append(" - Android off")
                        }
                    }
                    else -> "All messages"
                },
                onClick = if (state.notificationError != null) {
                    onRetry
                } else if (preference != null) {
                    { showNotifications = true }
                } else {
                    null
                },
            )
        }
        item {
            PodToggleSettingsRow(
                iconRes = R.drawable.ic_check_circle_24,
                title = "Automatic task suggestions",
                supportingText = "Suggest tasks from Pod activity",
                checked = details.todoGenerationEnabled,
                enabled = details.isEditor && details.archivedAt == null && !state.isTaskSuggestionsSaving,
                onCheckedChange = onUpdateTaskSuggestions,
            )
        }
        item { DustSectionHeader(label = "Manage") }
        item {
            PodSettingsRow(
                iconRes = R.drawable.ic_open_in_browser_24,
                title = "Advanced settings",
                supportingText = "Name, members, defaults, network, archive, and deletion",
                onClick = onOpenAdvancedSettings,
                trailingIconRes = R.drawable.ic_open_in_browser_24,
            )
        }
    }

    if (showMembers) {
        PodMembersSheet(members = details.members, onDismiss = { showMembers = false })
    }
    val notificationPreference = state.notificationPreference?.preference
    if (showNotifications && notificationPreference != null) {
        PodNotificationSheet(
            selected = notificationPreference,
            isSaving = state.isNotificationSaving,
            onSelect = { preference ->
                onUpdateNotification(preference)
                if (
                    notificationsAvailable &&
                    !notificationsEnabled &&
                    preference != PodNotificationCondition.NEVER
                ) {
                    onManageNotifications()
                }
                showNotifications = false
            },
            onDismiss = { showNotifications = false },
        )
    }
}
