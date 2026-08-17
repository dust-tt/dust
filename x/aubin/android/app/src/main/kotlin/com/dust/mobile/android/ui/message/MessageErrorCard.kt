package com.dust.mobile.android.ui.message

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.ErrorInfo

@Composable
internal fun ErrorCard(
    error: ErrorInfo,
    onRetry: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.boundedSurface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
    ) {
        Column(
            modifier = Modifier.padding(DustSpacing.medium),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.small),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_error_24),
                    contentDescription = null,
                    modifier = Modifier.size(DustDimensions.inlineIcon),
                    tint = MaterialTheme.colorScheme.error,
                )
                Text(
                    error.errorTitle ?: "Something went wrong",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Text(error.message, style = MaterialTheme.typography.bodySmall)
            if (error.isRetryable) {
                DustButton(
                    label = "Retry",
                    onClick = onRetry,
                    variant = DustButtonVariant.Text,
                )
            }
        }
    }
}
