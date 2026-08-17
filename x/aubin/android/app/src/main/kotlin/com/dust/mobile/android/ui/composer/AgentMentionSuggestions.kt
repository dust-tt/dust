package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.LightAgentConfiguration

@Composable
internal fun AgentMentionSuggestions(
    query: String,
    suggestions: List<LightAgentConfiguration>,
    selectedAgentId: String?,
    onSelect: (LightAgentConfiguration) -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .heightIn(max = 268.dp),
        shape = RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.boundedSurface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
        shadowElevation = 2.dp,
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_robot_24),
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.action,
                )
                Text(
                    text = "Agents",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
            if (suggestions.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(72.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (query.isEmpty()) "No agents available" else "No agents found",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.contentMuted,
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 224.dp)) {
                    itemsIndexed(
                        items = suggestions,
                        key = { _, agent -> agent.sId },
                    ) { index, agent ->
                        val isSelected = agent.sId == selectedAgentId
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 56.dp)
                                .background(
                                    if (index == 0) {
                                        MaterialTheme.colorScheme.actionContainer.copy(alpha = 0.45f)
                                    } else {
                                        Color.Transparent
                                    },
                                )
                                .clickable { onSelect(agent) }
                                .padding(horizontal = 12.dp, vertical = 6.dp)
                                .semantics {
                                    contentDescription = "Select agent ${agent.name}"
                                    if (isSelected) {
                                        stateDescription = "Selected"
                                    } else if (index == 0) {
                                        stateDescription = "Suggested"
                                    }
                                },
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DustAvatar(
                                name = agent.name,
                                avatarUrl = agent.pictureUrl,
                                size = 32.dp,
                                isAgent = true,
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) {
                                Text(
                                    text = agent.name,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                agent.description.takeIf { it.isNotBlank() }?.let { description ->
                                    Text(
                                        text = description,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.contentMuted,
                                    )
                                }
                            }
                            if (isSelected) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_check_24),
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = MaterialTheme.colorScheme.action,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
