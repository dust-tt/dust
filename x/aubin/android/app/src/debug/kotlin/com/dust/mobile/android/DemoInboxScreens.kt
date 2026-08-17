package com.dust.mobile.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.ConversationListSkeleton
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant
import com.dust.mobile.android.ui.common.DustSearchField
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun DemoInboxLoadingScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoRootHeader()
        ConversationListSkeleton(Modifier.weight(1f))
        DemoListBottomBar(showCatchUp = false)
    }
}

@Composable
internal fun DemoEmptyInboxScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoRootHeader()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_chat_24),
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
            Spacer(Modifier.height(DustSpacing.medium))
            Text(
                "No conversations yet",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(DustSpacing.small))
            Text(
                "Nothing needs attention right now.",
                color = MaterialTheme.colorScheme.contentMuted,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        DemoListBottomBar(showCatchUp = false)
    }
}

@Composable
internal fun DemoRootHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = DustDimensions.bottomBarHorizontalPadding,
                top = DustSpacing.extraSmall,
                end = DustSpacing.small,
                bottom = DustSpacing.extraSmall,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .height(DustDimensions.controlHeight),
            verticalArrangement = Arrangement.Center,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Revenue Team",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Icon(
                    painter = painterResource(R.drawable.ic_expand_more_24),
                    contentDescription = null,
                    modifier = Modifier.size(DustDimensions.inlineIcon),
                    tint = MaterialTheme.colorScheme.contentMuted,
                )
            }
            Text(
                "Sample workspace",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.contentMuted,
            )
        }
        DustIconButton(
            iconRes = R.drawable.ic_refresh_24,
            contentDescription = "Refresh conversations",
            onClick = {},
        )
        DustAvatar(name = "Lea Martin", size = 32.dp)
    }
}

@Composable
internal fun DemoPodsHeader(count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(DustDimensions.minimumTouchTarget)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(horizontal = DustDimensions.pageHorizontalPadding),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_space_open_24),
            contentDescription = null,
            modifier = Modifier.size(DustDimensions.inlineIcon),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
        Text("Pods", style = MaterialTheme.typography.labelMedium)
        Text(
            count.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.contentMuted,
        )
        Spacer(Modifier.weight(1f))
        Icon(
            painter = painterResource(R.drawable.ic_chevron_right_24),
            contentDescription = null,
            modifier = Modifier.size(DustDimensions.inlineIcon),
            tint = MaterialTheme.colorScheme.contentMuted,
        )
    }
}

@Composable
internal fun DemoListBottomBar(showCatchUp: Boolean = true) {
    HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = DustDimensions.bottomBarHorizontalPadding,
                vertical = DustSpacing.small,
            ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DustSearchField(
            value = "",
            onValueChange = {},
            placeholder = "Search",
            modifier = Modifier.weight(1f),
        )
        if (showCatchUp) {
            DustButton(
                label = "Catch Up",
                iconRes = R.drawable.ic_inbox_24,
                onClick = {},
                variant = DustButtonVariant.Secondary,
            )
        }
        DustIconButton(
            iconRes = R.drawable.ic_chat_plus_24,
            contentDescription = "New conversation",
            onClick = {},
            variant = DustIconButtonVariant.Primary,
        )
    }
}
