package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace

@Composable
internal fun PodLink(
    space: Space,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .clickable(onClick = onClick)
            .heightIn(min = DustDimensions.controlHeight)
            .padding(start = 40.dp, end = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_space_open_24),
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            space.name,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Icon(
            painter = painterResource(R.drawable.ic_chevron_right_24),
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LocalPreviewChip() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(5.dp)
                .background(MaterialTheme.colorScheme.action, RoundedCornerShape(1.dp)),
        )
        Text(
            "Sample workspace",
            maxLines = 1,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun ConversationRootHeader(
    user: User,
    isLocalPreview: Boolean,
    currentWorkspace: Workspace?,
    workspaces: List<Workspace>,
    onSwitchWorkspace: (Workspace) -> Unit,
    onLogout: () -> Unit,
    notificationsAvailable: Boolean,
    notificationsEnabled: Boolean,
    onManageNotifications: () -> Unit,
    onAddWidget: (() -> Unit)?,
    onAddQuickSettingsTile: (() -> Unit)?,
    systemSearchAvailable: Boolean,
    systemSearchEnabled: Boolean,
    onSystemSearchChange: (Boolean) -> Unit,
    onRefresh: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, top = 5.dp, end = 8.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WorkspaceTitlePicker(
            current = currentWorkspace,
            workspaces = workspaces,
            enabled = true,
            supportingContent = if (isLocalPreview) {
                { LocalPreviewChip() }
            } else {
                null
            },
            onSelect = onSwitchWorkspace,
            modifier = Modifier.weight(1f),
        )
        DustIconButton(
            onClick = onRefresh,
            iconRes = R.drawable.ic_refresh_24,
            contentDescription = "Refresh conversations",
        )
        AccountMenu(
            user = user,
            notificationsAvailable = notificationsAvailable,
            notificationsEnabled = notificationsEnabled,
            onManageNotifications = onManageNotifications,
            onAddWidget = onAddWidget,
            onAddQuickSettingsTile = onAddQuickSettingsTile,
            systemSearchAvailable = systemSearchAvailable,
            systemSearchEnabled = systemSearchEnabled,
            onSystemSearchChange = onSystemSearchChange,
            onLogout = onLogout,
        )
    }
}

@Composable
private fun WorkspaceTitlePicker(
    current: Workspace?,
    workspaces: List<Workspace>,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    supportingContent: (@Composable () -> Unit)? = null,
    onSelect: (Workspace) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val canSwitchWorkspace = enabled && workspaces.size > 1
    val titleModifier = if (canSwitchWorkspace) {
        Modifier
            .clickable {
                focusManager.clearFocus(force = true)
                keyboardController?.hide()
                expanded = true
            }
            .semantics { contentDescription = "Switch workspace" }
    } else {
        Modifier
    }
    Box(modifier = modifier) {
        Surface(
            modifier = titleModifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
            shape = RoundedCornerShape(DustRadii.control),
            color = Color.Transparent,
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 5.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        current?.name ?: "Workspace",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (canSwitchWorkspace) {
                        Icon(
                            painter = painterResource(R.drawable.ic_expand_more_24),
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                supportingContent?.invoke()
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.widthIn(min = 220.dp, max = 280.dp),
            shape = RoundedCornerShape(8.dp),
            containerColor = MaterialTheme.colorScheme.background,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp,
        ) {
            workspaces.forEach { workspace ->
                val isSelected = workspace.sId == current?.sId
                DropdownMenuItem(
                    text = {
                        Text(
                            workspace.name,
                            fontWeight = if (isSelected) {
                                FontWeight.SemiBold
                            } else {
                                null
                            },
                        )
                    },
                    trailingIcon = {
                        if (isSelected) {
                            Icon(
                                painter = painterResource(R.drawable.ic_check_24),
                                contentDescription = "Selected workspace",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.action,
                            )
                        }
                    },
                    onClick = {
                        expanded = false
                        onSelect(workspace)
                    },
                )
            }
        }
    }
}
