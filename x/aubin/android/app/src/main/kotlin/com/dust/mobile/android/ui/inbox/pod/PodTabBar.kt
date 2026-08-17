package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun PodTabBar(
    selectedTab: PodTab,
    onSelectTab: (PodTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(60.dp)
            .background(MaterialTheme.colorScheme.background)
            .selectableGroup(),
    ) {
        PodTab.entries.forEach { tab ->
            PodTabItem(
                tab = tab,
                selected = tab == selectedTab,
                onClick = { onSelectTab(tab) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun PodTabItem(
    tab: PodTab,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val color = if (selected) MaterialTheme.colorScheme.action else MaterialTheme.colorScheme.contentMuted
    Box(
        modifier = modifier
            .height(60.dp)
            .selectable(
                selected = selected,
                onClick = onClick,
                role = Role.Tab,
            ),
    ) {
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                painter = painterResource(tab.iconRes),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = color,
            )
            Text(
                text = tab.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = color,
                style = MaterialTheme.typography.labelSmall,
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(if (selected) 2.dp else 1.dp)
                .align(Alignment.BottomCenter)
                .background(if (selected) MaterialTheme.colorScheme.action else MaterialTheme.colorScheme.subtleBorder),
        )
    }
}

private val PodTab.label: String
    get() = when (this) {
        PodTab.CONVERSATIONS -> "Chats"
        PodTab.TASKS -> "Tasks"
        PodTab.FILES -> "Files"
        PodTab.SETTINGS -> "Settings"
    }

private val PodTab.iconRes: Int
    get() = when (this) {
        PodTab.CONVERSATIONS -> R.drawable.ic_chat_24
        PodTab.TASKS -> R.drawable.ic_check_circle_24
        PodTab.FILES -> R.drawable.ic_folder_24
        PodTab.SETTINGS -> R.drawable.ic_settings_24
    }
