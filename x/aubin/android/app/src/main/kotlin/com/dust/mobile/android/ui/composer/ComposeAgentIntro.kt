package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.AgentProfileSkeleton
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.LightAgentConfiguration

@Composable
internal fun ComposeAgentIntro(
    agent: LightAgentConfiguration?,
    isLoading: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                horizontal = DustDimensions.pageHorizontalPadding,
                vertical = DustSpacing.medium,
            ),
    ) {
        ContentCrossfade(
            targetState = isLoading,
            label = "compose-agent-loading",
            modifier = Modifier.fillMaxWidth(),
        ) { loading ->
            if (loading) {
                AgentProfileSkeleton()
            } else {
                agent?.let { selectedAgent ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = DustDimensions.minimumTouchTarget),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        DustAvatar(
                            name = selectedAgent.name,
                            avatarUrl = selectedAgent.pictureUrl,
                            size = 40.dp,
                            isAgent = true,
                        )
                        Spacer(Modifier.width(DustSpacing.medium))
                        Column(
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(
                                "@${selectedAgent.name}",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            selectedAgent.description.takeIf { it.isNotBlank() }?.let { description ->
                                Text(
                                    description,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.contentMuted,
                                )
                            }
                        }
                    }
                }
            }
        }
        Spacer(Modifier.weight(1f))
    }
}
