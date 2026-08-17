package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.core.model.User

@Composable
internal fun AccountMenu(
    user: User,
    notificationsAvailable: Boolean,
    notificationsEnabled: Boolean,
    onManageNotifications: () -> Unit,
    onAddWidget: (() -> Unit)?,
    onAddQuickSettingsTile: (() -> Unit)?,
    systemSearchAvailable: Boolean,
    systemSearchEnabled: Boolean,
    onSystemSearchChange: (Boolean) -> Unit,
    onLogout: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current

    Box {
        Surface(
            modifier = Modifier
                .size(48.dp)
                .semantics { contentDescription = "Account menu" }
                .clickable {
                    focusManager.clearFocus(force = true)
                    keyboardController?.hide()
                    expanded = true
                },
            color = Color.Transparent,
            shape = CircleShape,
        ) {
            Box(contentAlignment = Alignment.Center) {
                DustAvatar(
                    name = user.displayName,
                    avatarUrl = user.profilePictureUrl,
                    size = 28.dp,
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.widthIn(min = 220.dp, max = 280.dp),
            shape = RoundedCornerShape(DustRadii.control),
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp,
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    user.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    user.email,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider()
            onAddWidget?.let { addWidget ->
                DropdownMenuItem(
                    text = { Text("Add Catch Up widget") },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(R.drawable.ic_pin_24),
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    onClick = {
                        expanded = false
                        addWidget()
                    },
                )
            }
            onAddQuickSettingsTile?.let { addTile ->
                DropdownMenuItem(
                    text = { Text("Add Ask Dust tile") },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(R.drawable.ic_tune_24),
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    onClick = {
                        expanded = false
                        addTile()
                    },
                )
            }
            if (notificationsAvailable) {
                DropdownMenuItem(
                    text = { Text("Notifications") },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(R.drawable.ic_notifications_24),
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    trailingIcon = {
                        Text(
                            text = if (notificationsEnabled) "On" else "Off",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    onClick = {
                        expanded = false
                        onManageNotifications()
                    },
                )
            }
            if (systemSearchAvailable) {
                DropdownMenuItem(
                    text = { Text("Android search") },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(R.drawable.ic_search_24),
                            contentDescription = null,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    trailingIcon = {
                        Switch(
                            checked = systemSearchEnabled,
                            onCheckedChange = null,
                        )
                    },
                    onClick = { onSystemSearchChange(!systemSearchEnabled) },
                )
            }
            DropdownMenuItem(
                text = { Text("Sign out") },
                onClick = {
                    expanded = false
                    onLogout()
                },
            )
        }
    }
}
