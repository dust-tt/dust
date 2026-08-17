package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.PodDetails
import com.dust.mobile.core.model.accessLabel

@Composable
internal fun PodOverviewHeader(
    details: PodDetails,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.medium),
        verticalArrangement = Arrangement.spacedBy(DustSpacing.small),
    ) {
        details.description?.takeIf { it.isNotBlank() }?.let { description ->
            Text(
                text = description,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(DustSpacing.large),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PodMetadataLabel(
                iconRes = if (details.isRestricted) R.drawable.ic_lock_24 else R.drawable.ic_space_open_24,
                label = details.accessLabel(),
            )
            PodMetadataLabel(
                iconRes = R.drawable.ic_group_24,
                label = "${details.members.size} ${if (details.members.size == 1) "member" else "members"}",
            )
            if (details.archivedAt != null) {
                PodMetadataLabel(iconRes = R.drawable.ic_clock_24, label = "Archived")
            }
        }
    }
}

@Composable
private fun PodMetadataLabel(iconRes: Int, label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Text(
            text = label,
            color = MaterialTheme.colorScheme.contentMuted,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}
