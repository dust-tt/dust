package com.dust.mobile.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.interactiveSurface

@Composable
internal fun DemoFileRow(
    title: String,
    source: String,
    iconRes: Int,
    accent: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = DustDimensions.rowMinimumHeight)
            .padding(
                horizontal = DustDimensions.pageHorizontalPadding,
                vertical = DustSpacing.extraSmall,
            ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(DustDimensions.contentIcon),
            tint = if (accent) MaterialTheme.colorScheme.action else MaterialTheme.colorScheme.contentMuted,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        ) {
            Text(
                title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                "by $source",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.contentMuted,
            )
        }
        if (accent) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier.size(DustDimensions.inlineIcon),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}

@Composable
internal fun DemoSection(
    label: String,
    count: Int? = null,
    uppercase: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = DustDimensions.pageHorizontalPadding,
                top = DustSpacing.small,
                end = DustDimensions.pageHorizontalPadding,
                bottom = DustSpacing.extraSmall,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (uppercase) label.uppercase() else label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.contentMuted,
        )
        count?.let {
            Text(
                it.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}

@Composable
internal fun DemoConversationRow(
    title: String,
    badge: String? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = DustDimensions.rowMinimumHeight)
            .padding(
                start = DustDimensions.pageHorizontalPadding,
                end = DustDimensions.bottomBarHorizontalPadding,
            ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (badge != null) FontWeight.Medium else FontWeight.Normal,
        )
        badge?.let { status ->
            Box(
                Modifier
                    .size(6.dp)
                    .background(
                        if (status == "Action required") {
                            MaterialTheme.colorScheme.tertiary
                        } else {
                            MaterialTheme.colorScheme.action
                        },
                        CircleShape,
                    ),
            )
        }
    }
}

@Composable
internal fun DemoMessageBubble(speaker: String, text: String, user: Boolean) {
    if (user) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(0.82f),
                color = MaterialTheme.colorScheme.interactiveSurface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                shape = RoundedCornerShape(DustRadii.messageBubble),
            ) {
                Text(
                    text,
                    modifier = Modifier.padding(
                        horizontal = 14.dp,
                        vertical = 10.dp,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(DustSpacing.small)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DustAvatar(name = speaker, size = 28.dp, isAgent = true)
                Text("@$speaker", style = MaterialTheme.typography.labelMedium)
            }
            Text(
                text,
                modifier = Modifier.padding(start = 34.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
