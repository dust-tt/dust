package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted

@Composable
internal fun CatchUpHeader(
    progress: String,
    onClose: () -> Unit,
    onUndo: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = DustDimensions.topBarHeight)
            .padding(start = DustSpacing.large, end = DustSpacing.extraSmall),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        ) {
            Text("Catch up", style = MaterialTheme.typography.titleMedium)
            Text(
                text = progress,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.contentMuted,
            )
        }
        onUndo?.let { undo ->
            DustButton(
                label = "Undo",
                onClick = undo,
                enabled = enabled,
                variant = DustButtonVariant.Text,
            )
        }
        DustIconButton(
            enabled = enabled,
            onClick = onClose,
            iconRes = R.drawable.ic_close_24,
            contentDescription = "Close",
        )
    }
}
