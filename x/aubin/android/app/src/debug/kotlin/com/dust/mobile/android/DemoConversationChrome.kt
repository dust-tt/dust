package com.dust.mobile.android

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.composer.AgentSelector
import com.dust.mobile.android.ui.preview.localPreviewAgents
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun DemoPushedHeader(
    title: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(DustDimensions.topBarHeight),
    ) {
        Box(modifier = Modifier.align(Alignment.CenterStart)) {
            DustIconButton(
                iconRes = R.drawable.ic_arrow_back_24,
                contentDescription = "Back",
                onClick = {},
            )
        }
        title?.let {
            Text(
                it,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 64.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
        }
        action?.let {
            Box(modifier = Modifier.align(Alignment.CenterEnd)) {
                it()
            }
        }
    }
}

@Composable
internal fun DemoComposerBar(showNewConversation: Boolean = false) {
    val agents = localPreviewAgents()
    val selectedAgent = agents.first()

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = DustDimensions.bottomBarHorizontalPadding,
                vertical = DustSpacing.small,
            ),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.interactiveSurface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
    ) {
        Column {
            Text(
                "Ask anything or call an agent with @",
                modifier = Modifier.padding(
                    horizontal = DustSpacing.medium,
                    vertical = DustSpacing.medium,
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.padding(
                    start = DustSpacing.extraSmall,
                    end = DustSpacing.extraSmall,
                    bottom = DustSpacing.small,
                ),
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AgentSelector(
                    agents = agents,
                    selected = selectedAgent,
                    onPickerOpen = {},
                    onPickerClose = {},
                    onSelect = {},
                )
                DustIconButton(
                    iconRes = R.drawable.ic_tune_24,
                    contentDescription = "Add tools and skills",
                    onClick = {},
                )
                DustIconButton(
                    iconRes = R.drawable.ic_attach_file_24,
                    contentDescription = "Add context",
                    onClick = {},
                )
                if (showNewConversation) {
                    DustIconButton(
                        iconRes = R.drawable.ic_chat_plus_24,
                        contentDescription = "New conversation",
                        onClick = {},
                    )
                }
                Spacer(Modifier.weight(1f))
                DustIconButton(
                    iconRes = R.drawable.ic_mic_24,
                    contentDescription = "Voice input",
                    onClick = {},
                )
            }
        }
    }
}
