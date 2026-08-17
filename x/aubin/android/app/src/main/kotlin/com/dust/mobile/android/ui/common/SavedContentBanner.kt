package com.dust.mobile.android.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.interactiveSurface

@Composable
internal fun SavedContentBanner(
    message: String,
    retryContentDescription: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.interactiveSurface)
            .heightIn(min = DustDimensions.minimumTouchTarget)
            .padding(start = DustDimensions.pageHorizontalPadding, end = DustSpacing.extraSmall),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = message,
            modifier = Modifier.weight(1f),
            maxLines = 2,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.contentMuted,
        )
        DustIconButton(
            iconRes = R.drawable.ic_refresh_24,
            contentDescription = retryContentDescription,
            onClick = onRetry,
        )
    }
}
