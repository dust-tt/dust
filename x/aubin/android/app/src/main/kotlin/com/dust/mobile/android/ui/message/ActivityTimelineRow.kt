package com.dust.mobile.android.ui.message

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.activeStatusPulse
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.ActivityTimelineRow
import com.dust.mobile.core.model.ActivityTimelineRowKind

@Composable
internal fun ActivityTimelineRowView(
    row: ActivityTimelineRow,
    isLast: Boolean,
    onToggleThinking: () -> Unit,
) {
    val isMotionEnabled = motionEnabled()
    val textColor = when (row.kind) {
        ActivityTimelineRowKind.ACTIVE_THINKING,
        ActivityTimelineRowKind.ACTIVE_ACTION,
        -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val isExpandableThinking = row.kind == ActivityTimelineRowKind.THINKING && row.isExpandable
    val rowModifier = if (isExpandableThinking) {
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggleThinking)
            .animateContentSize(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 180 else 0,
                    easing = FastOutSlowInEasing,
                ),
                alignment = Alignment.TopStart,
            )
    } else {
        Modifier.fillMaxWidth()
    }

    Row(
        modifier = rowModifier.height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        ActivityTimelineMarker(row, isLast)
        val labelModifier = Modifier
            .weight(1f)
            .padding(top = 1.dp, bottom = if (isLast) 0.dp else 10.dp)
        if (isExpandableThinking) {
            ExpandableThinkingLabel(row, textColor, labelModifier, isMotionEnabled)
        } else {
            ActivityTimelineLabel(row, textColor, labelModifier)
        }
    }
}

@Composable
private fun ExpandableThinkingLabel(
    row: ActivityTimelineRow,
    textColor: Color,
    modifier: Modifier,
    isMotionEnabled: Boolean,
) {
    val chevronRotation by animateFloatAsState(
        targetValue = if (row.isTruncated) 0f else 90f,
        animationSpec = tween(durationMillis = if (isMotionEnabled) 160 else 0),
        label = "thinking-chevron",
    )
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        ActivityThinkingMarkdown(
            text = row.label.orEmpty(),
            color = textColor,
            modifier = Modifier.weight(1f),
        )
        Icon(
            painter = painterResource(R.drawable.ic_chevron_right_24),
            contentDescription = if (row.isTruncated) "Expand thinking" else "Collapse thinking",
            modifier = Modifier
                .padding(top = 3.dp)
                .size(11.dp)
                .graphicsLayer { rotationZ = chevronRotation },
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )
    }
}

@Composable
private fun ActivityTimelineLabel(
    row: ActivityTimelineRow,
    textColor: Color,
    modifier: Modifier,
) {
    val maxLines = when (row.kind) {
        ActivityTimelineRowKind.ACTION,
        ActivityTimelineRowKind.ACTIVE_ACTION,
        -> 2
        ActivityTimelineRowKind.ACTIVE_THINKING -> 14
        else -> Int.MAX_VALUE
    }
    if (row.kind == ActivityTimelineRowKind.THINKING || row.kind == ActivityTimelineRowKind.ACTIVE_THINKING) {
        ActivityThinkingMarkdown(
            text = row.label.orEmpty(),
            color = textColor,
            modifier = modifier,
            maxLines = maxLines,
            isStreaming = row.kind == ActivityTimelineRowKind.ACTIVE_THINKING,
            streamKey = row.id,
        )
    } else {
        Text(
            text = row.label.orEmpty(),
            modifier = modifier,
            style = MaterialTheme.typography.bodySmall,
            color = textColor,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ActivityThinkingMarkdown(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    isStreaming: Boolean = false,
    streamKey: String = "thinking",
) {
    val visibleText = rememberStreamingText(
        streamKey = streamKey,
        text = text,
        isStreaming = isStreaming,
        resetOnNonAppend = isStreaming,
    )
    val typography = MaterialTheme.typography.bodySmall
    val style = StreamingMarkdownStyle(
        body = typography,
        titleLarge = typography,
        titleMedium = typography,
        titleSmall = typography,
        textColor = color,
        mutedColor = MaterialTheme.colorScheme.onSurfaceVariant,
        linkColor = MaterialTheme.colorScheme.action,
        codeBackground = MaterialTheme.colorScheme.interactiveSurface,
    )
    val annotated = remember(visibleText, style) {
        activityThinkingAnnotatedText(visibleText, style)
    }
    val scrollState = rememberScrollState()
    LaunchedEffect(annotated.text, isStreaming) {
        if (isStreaming) {
            withFrameNanos { }
            scrollState.scrollTo(scrollState.maxValue)
        }
    }
    Text(
        text = annotated,
        modifier = if (isStreaming) {
            modifier
                .heightIn(max = ACTIVE_THINKING_MAX_HEIGHT)
                .verticalScroll(scrollState, enabled = false)
        } else {
            modifier
        },
        style = typography,
        color = color,
        maxLines = if (isStreaming) Int.MAX_VALUE else maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

private val ACTIVE_THINKING_MAX_HEIGHT = 252.dp

internal fun activityThinkingAnnotatedText(
    content: String,
    style: StreamingMarkdownStyle,
) = streamingAnnotatedText(stabilizeStreamingMarkdown(content), style)

@Composable
private fun ActivityTimelineMarker(row: ActivityTimelineRow, isLast: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(width = 16.dp, height = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            ActivityTimelineMarkerIcon(row)
        }
        if (!isLast) {
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .weight(1f)
                    .background(MaterialTheme.colorScheme.subtleBorder),
            )
        }
    }
}

@Composable
private fun ActivityTimelineMarkerIcon(row: ActivityTimelineRow) {
    val isActive = row.kind in setOf(
        ActivityTimelineRowKind.ACTIVE_THINKING,
        ActivityTimelineRowKind.ACTIVE_ACTION,
        ActivityTimelineRowKind.IDLE,
    )
    val iconRes = when (row.kind) {
        ActivityTimelineRowKind.ACTIVE_ACTION,
        ActivityTimelineRowKind.ACTION,
        -> R.drawable.ic_tool_24
        ActivityTimelineRowKind.DONE -> R.drawable.ic_check_24
        ActivityTimelineRowKind.ACTIVE_THINKING,
        ActivityTimelineRowKind.THINKING,
        ActivityTimelineRowKind.IDLE,
        -> R.drawable.ic_thinking_24
    }
    Icon(
        painter = painterResource(iconRes),
        contentDescription = null,
        modifier = Modifier
            .size(13.dp)
            .activeStatusPulse(isActive),
        tint = if (isActive) {
            MaterialTheme.colorScheme.action
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
    )
}
