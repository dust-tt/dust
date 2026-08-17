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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.core.model.CitationDisplayEntry
import com.dust.mobile.core.model.CitationReference

@Composable
internal fun CitationSection(
    entries: List<CitationDisplayEntry>,
    onOpen: ((CitationReference) -> Unit)?,
) {
    val isMotionEnabled = motionEnabled()
    var expanded by remember(entries) { mutableStateOf(false) }
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 90f else 0f,
        animationSpec = tween(durationMillis = if (isMotionEnabled) 160 else 0),
        label = "citations-chevron",
    )
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier
                .heightIn(min = 44.dp)
                .clickable { expanded = !expanded },
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (entries.size == 1) "1 source" else "${entries.size} sources",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = if (expanded) "Hide sources" else "Show sources",
                modifier = Modifier
                    .size(10.dp)
                    .graphicsLayer { rotationZ = chevronRotation },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(
                animationSpec = tween(
                    durationMillis = if (isMotionEnabled) 180 else 0,
                    easing = FastOutSlowInEasing,
                ),
                expandFrom = Alignment.Top,
            ) + fadeIn(
                tween(
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
                tween(
                    durationMillis = if (isMotionEnabled) 100 else 0,
                    easing = FastOutLinearInEasing,
                ),
            ),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                entries.forEach { entry ->
                    val enabled = entry.citation.href != null && onOpen != null
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                            .clickable(enabled = enabled) { onOpen?.invoke(entry.citation) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(36.dp),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.interactiveSurface,
                            contentColor = MaterialTheme.colorScheme.onSurface,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_document_24),
                                    contentDescription = null,
                                    modifier = Modifier.size(14.dp),
                                    tint = MaterialTheme.colorScheme.action,
                                )
                                Text(
                                    "${entry.number}. ${entry.citation.title}",
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                if (entry.citation.href != null) {
                                    Icon(
                                        painter = painterResource(R.drawable.ic_open_in_browser_24),
                                        contentDescription = null,
                                        modifier = Modifier.size(12.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
