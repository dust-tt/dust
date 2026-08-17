package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted

@Composable
internal fun ConversationFocusSectionHeader(
    label: String,
    count: Int,
    onCatchUp: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = DustDimensions.minimumTouchTarget)
            .padding(start = DustDimensions.pageHorizontalPadding, end = DustSpacing.extraSmall),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
        )
        Text(
            text = count.toString(),
            modifier = Modifier.padding(start = DustSpacing.small),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.contentMuted,
        )
        Spacer(Modifier.weight(1f))
        onCatchUp?.let {
            DustButton(
                label = "Catch up",
                iconRes = R.drawable.ic_inbox_24,
                onClick = it,
                variant = DustButtonVariant.NeutralText,
            )
        }
    }
}
