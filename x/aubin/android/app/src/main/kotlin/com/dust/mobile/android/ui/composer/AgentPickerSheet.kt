package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.DustModalHeader
import com.dust.mobile.android.ui.common.DustSearchField
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.favoriteLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AgentPickerSheet(
    agents: List<LightAgentConfiguration>,
    selectedAgentId: String?,
    query: String,
    onQueryChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onSelect: (LightAgentConfiguration) -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.boundedSurface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        tonalElevation = 0.dp,
    ) {
        Column(modifier = Modifier.fillMaxHeight(0.86f)) {
            DustModalHeader(title = "Select an agent", onClose = onDismiss)
            DustSearchField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = "Search agents",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = DustSpacing.large),
            )
            if (agents.isEmpty()) {
                DustFeedbackState(
                    iconRes = R.drawable.ic_robot_24,
                    title = "No agents",
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = DustSpacing.small),
                ) {
                    items(agents, key = { it.sId }) { agent ->
                        AgentPickerRow(
                            agent = agent,
                            selected = agent.sId == selectedAgentId,
                            onClick = { onSelect(agent) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AgentPickerRow(
    agent: LightAgentConfiguration,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.small),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DustAvatar(
            name = agent.name,
            avatarUrl = agent.pictureUrl,
            size = 36.dp,
            isAgent = true,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = agent.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelLarge,
                )
                agent.favoriteLabel()?.let { label ->
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.action,
                    )
                }
            }
            if (agent.description.isNotBlank()) {
                Text(
                    text = agent.description,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.contentMuted,
                )
            }
        }
        if (selected) {
            Icon(
                painter = painterResource(R.drawable.ic_check_24),
                contentDescription = "Selected agent",
                modifier = Modifier.size(DustDimensions.actionIcon),
                tint = MaterialTheme.colorScheme.action,
            )
        }
    }
}
