package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.PodTaskFilter

@Composable
internal fun PodTaskFilterControl(
    selected: PodTaskFilter,
    onSelect: (PodTaskFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(DustRadii.control)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.medium)
            .height(44.dp)
            .border(1.dp, MaterialTheme.colorScheme.subtleBorder, shape)
            .selectableGroup(),
    ) {
        PodTaskFilter.entries.forEach { filter ->
            val isSelected = selected == filter
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp)
                    .background(
                        if (isSelected) MaterialTheme.colorScheme.actionContainer else androidx.compose.ui.graphics.Color.Transparent,
                        shape,
                    )
                    .selectable(
                        selected = isSelected,
                        onClick = { onSelect(filter) },
                        role = Role.RadioButton,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (filter == PodTaskFilter.OPEN) "Open" else "Done",
                    color = if (isSelected) MaterialTheme.colorScheme.action else MaterialTheme.colorScheme.contentMuted,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}
