package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.actionContainer
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.onActionContainer
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun RemovableComposerChip(
    label: String,
    accent: Boolean = false,
    onRemove: () -> Unit,
) {
    Box(
        modifier = Modifier
            .height(DustDimensions.minimumTouchTarget)
            .clickable(onClick = onRemove),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier.height(32.dp),
            shape = RoundedCornerShape(DustRadii.control),
            color = if (accent) {
                MaterialTheme.colorScheme.actionContainer
            } else {
                MaterialTheme.colorScheme.boundedSurface
            },
            contentColor = if (accent) {
                MaterialTheme.colorScheme.onActionContainer
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
        ) {
            Row(
                modifier = Modifier.padding(start = 10.dp, end = DustSpacing.small),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                )
                Icon(
                    painter = painterResource(R.drawable.ic_close_24),
                    contentDescription = "Remove $label",
                    modifier = Modifier.size(12.dp),
                )
            }
        }
    }
}
