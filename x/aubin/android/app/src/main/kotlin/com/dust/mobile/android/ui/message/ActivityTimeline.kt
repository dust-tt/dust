package com.dust.mobile.android.ui.message

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.activityTimelineDisplay
import com.dust.mobile.core.stream.AgentMessageStream

@Composable
internal fun ActivityTimeline(
    activity: AgentMessageStream.Activity?,
    chainOfThought: String?,
    completedSteps: List<ActivityStep>,
    activeActions: List<ActiveAction>,
    isStreaming: Boolean,
    isBlocking: Boolean,
) {
    val isMotionEnabled = motionEnabled()
    var collapsed by remember(isStreaming) { mutableStateOf(!isStreaming) }
    var expandedThinkingIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    val display = remember(
        activity,
        chainOfThought,
        completedSteps,
        activeActions,
        isStreaming,
        isBlocking,
        expandedThinkingIds,
    ) {
        activityTimelineDisplay(
            isStreaming = isStreaming,
            isGenerating = activity == AgentMessageStream.Activity.GENERATING,
            isBlocking = isBlocking,
            chainOfThought = chainOfThought,
            completedSteps = completedSteps,
            activeActions = activeActions,
            expandedThinkingIds = expandedThinkingIds,
        )
    }
    if (display.rows.isEmpty()) return

    Column {
        display.headerLabel?.let { label ->
            val chevronRotation by animateFloatAsState(
                targetValue = if (collapsed) 0f else 90f,
                animationSpec = tween(durationMillis = if (isMotionEnabled) 160 else 0),
                label = "activity-chevron",
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clickable { collapsed = !collapsed },
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    painter = painterResource(R.drawable.ic_chevron_right_24),
                    contentDescription = if (collapsed) "Expand activity" else "Collapse activity",
                    modifier = Modifier
                        .size(11.dp)
                        .graphicsLayer { rotationZ = chevronRotation },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        AnimatedVisibility(
            visible = display.headerLabel == null || !collapsed,
            enter = expandVertically(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 180 else 0,
                    easing = FastOutSlowInEasing,
                ),
                expandFrom = Alignment.Top,
            ) + fadeIn(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 140 else 0,
                    easing = LinearOutSlowInEasing,
                ),
            ),
            exit = shrinkVertically(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 150 else 0,
                    easing = FastOutSlowInEasing,
                ),
                shrinkTowards = Alignment.Top,
            ) + fadeOut(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 100 else 0,
                    easing = FastOutLinearInEasing,
                ),
            ),
        ) {
            Column(modifier = Modifier.padding(bottom = 8.dp)) {
                display.rows.forEachIndexed { index, row ->
                    ActivityTimelineRowView(
                        row = row,
                        isLast = index == display.rows.lastIndex,
                        onToggleThinking = {
                            expandedThinkingIds = if (row.id in expandedThinkingIds) {
                                expandedThinkingIds - row.id
                            } else {
                                expandedThinkingIds + row.id
                            }
                        },
                    )
                }
            }
        }
    }
}
