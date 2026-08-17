package com.dust.mobile.android.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted

@Composable
internal fun DustFeedbackState(
    iconRes: Int,
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .padding(horizontal = DustSpacing.huge),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(DustDimensions.contentIcon),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Spacer(Modifier.height(DustSpacing.large))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        if (!message.isNullOrBlank()) {
            Spacer(Modifier.height(DustSpacing.small))
            Text(
                text = message,
                color = MaterialTheme.colorScheme.contentMuted,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(DustSpacing.extraLarge))
            DustButton(
                label = actionLabel,
                onClick = onAction,
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 320.dp),
            )
        }
    }
}

@Composable
internal fun ErrorScreen(message: String, onRetry: () -> Unit) {
    DustFeedbackState(
        iconRes = R.drawable.ic_error_24,
        title = "Something went wrong",
        message = message,
        actionLabel = "Try again",
        onAction = onRetry,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    )
}
