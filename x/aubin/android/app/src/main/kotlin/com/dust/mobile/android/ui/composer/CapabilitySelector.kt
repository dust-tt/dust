package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustSearchField
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.filterSelectableCapabilities

@Composable
internal fun CapabilitySelector(
    capabilities: List<Capability>,
    selected: List<Capability>,
    onToggle: (Capability) -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    val selectableCapabilities = remember(capabilities, selected, query) {
        filterSelectableCapabilities(capabilities = capabilities, selected = selected, query = query, limit = 24)
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(DustSpacing.medium),
    ) {
        DustSearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = "Search tools and skills",
            modifier = Modifier.fillMaxWidth(),
        )
        if (selectableCapabilities.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    capabilitySearchEmptyLabel(query),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.contentMuted,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
            ) {
                items(selectableCapabilities, key = { it.id }) { capability ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggle(capability) }
                            .heightIn(min = DustDimensions.rowMinimumHeight)
                            .padding(vertical = DustSpacing.small),
                        horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val isSkill = capability is Capability.SkillCapability
                        Surface(
                            modifier = Modifier.size(32.dp),
                            shape = RoundedCornerShape(DustRadii.control),
                            color = if (isSkill) {
                                MaterialTheme.colorScheme.actionContainer
                            } else {
                                Color.Transparent
                            },
                            contentColor = if (isSkill) {
                                MaterialTheme.colorScheme.action
                            } else {
                                MaterialTheme.colorScheme.contentStrong
                            },
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    painter = painterResource(
                                        if (isSkill) R.drawable.ic_robot_24 else R.drawable.ic_tool_24,
                                    ),
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
                        ) {
                            Text(
                                capability.displayName,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.contentStrong,
                            )
                            if (capability.displayDescription.isNotBlank()) {
                                Text(
                                    capability.displayDescription,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.contentMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

internal fun capabilitySearchEmptyLabel(query: String): String =
    if (query.isEmpty()) {
        "No tools or skills available"
    } else {
        "No results"
    }
