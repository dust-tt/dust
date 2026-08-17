package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.filterAgents

@Composable
internal fun AgentSelector(
    agents: List<LightAgentConfiguration>,
    selected: LightAgentConfiguration?,
    enabled: Boolean = true,
    onPickerOpen: () -> Unit,
    onPickerClose: () -> Unit,
    onSelect: (LightAgentConfiguration) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val canOpen = enabled && agents.isNotEmpty()
    val filteredAgents = remember(agents, query) { filterAgents(agents, query) }

    fun openPicker() {
        onPickerOpen()
        expanded = true
    }

    fun closePicker() {
        expanded = false
        query = ""
        onPickerClose()
    }

    selected?.let { agent ->
        Surface(
            modifier = Modifier
                .size(DustDimensions.minimumTouchTarget)
                .semantics { contentDescription = "Select agent: ${agent.name}" }
                .clickable(enabled = canOpen, onClick = ::openPicker),
            shape = RoundedCornerShape(DustRadii.control),
            color = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ) {
            Box(contentAlignment = Alignment.Center) {
                DustAvatar(
                    name = agent.name,
                    avatarUrl = agent.pictureUrl,
                    size = 28.dp,
                    isAgent = true,
                )
            }
        }
    } ?: DustIconButton(
        onClick = ::openPicker,
        iconRes = R.drawable.ic_robot_24,
        contentDescription = "Select agent",
        enabled = canOpen,
    )

    if (expanded) {
        AgentPickerSheet(
            agents = filteredAgents,
            selectedAgentId = selected?.sId,
            query = query,
            onQueryChange = { query = it },
            onDismiss = ::closePicker,
            onSelect = { agent ->
                onSelect(agent)
                closePicker()
            },
        )
    }
}
