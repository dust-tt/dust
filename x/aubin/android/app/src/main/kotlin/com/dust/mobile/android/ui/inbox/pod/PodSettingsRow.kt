package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.onAction
import com.dust.mobile.android.ui.theme.contentMuted

@Composable
internal fun PodSettingsRow(
    iconRes: Int,
    title: String,
    supportingText: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailingIconRes: Int? = if (onClick != null) R.drawable.ic_chevron_right_24 else null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = DustSpacing.medium),
        ) {
            Text(
                text = title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = supportingText,
                color = MaterialTheme.colorScheme.contentMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        trailingIconRes?.let { iconResValue ->
            Icon(
                painter = painterResource(iconResValue),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}

@Composable
internal fun PodToggleSettingsRow(
    iconRes: Int,
    title: String,
    supportingText: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = DustSpacing.medium),
        ) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = supportingText,
                color = MaterialTheme.colorScheme.contentMuted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MaterialTheme.colorScheme.onAction,
                checkedTrackColor = MaterialTheme.colorScheme.action,
            ),
        )
    }
}
