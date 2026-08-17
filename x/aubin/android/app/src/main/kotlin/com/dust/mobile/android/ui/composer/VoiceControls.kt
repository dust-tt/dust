package com.dust.mobile.android.ui.composer

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.onAction

@Composable
internal fun VoiceRecordButton(
    isRecording: Boolean,
    enabled: Boolean,
    startContentDescription: String = "Start recording",
    onStart: () -> Unit,
    onStop: () -> Unit,
) {
    Surface(
        modifier = Modifier.size(64.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.action,
        contentColor = MaterialTheme.colorScheme.onAction,
        shadowElevation = 4.dp,
    ) {
        IconButton(
            modifier = Modifier.semantics {
                contentDescription = if (isRecording) "Stop recording" else startContentDescription
            },
            enabled = enabled,
            onClick = if (isRecording) onStop else onStart,
        ) {
            if (isRecording) {
                Box(
                    Modifier
                        .size(22.dp)
                        .background(MaterialTheme.colorScheme.onAction, RoundedCornerShape(5.dp)),
                )
            } else {
                Icon(
                    painter = painterResource(R.drawable.ic_mic_24),
                    contentDescription = null,
                    modifier = Modifier.size(26.dp),
                )
            }
        }
    }
}

@Composable
internal fun VoicePulse(level: Float, active: Boolean) {
    val isMotionEnabled = motionEnabled()
    val targetAmplitude = when {
        !active -> 0f
        !isMotionEnabled -> 0.12f
        else -> level.coerceIn(0f, 1f)
    }
    val amplitude by animateFloatAsState(
        targetValue = targetAmplitude,
        animationSpec = if (isMotionEnabled) {
            spring(
                dampingRatio = Spring.DampingRatioNoBouncy,
                stiffness = Spring.StiffnessMediumLow,
            )
        } else {
            snap()
        },
        label = "voice-pulse-amplitude",
    )
    Box(
        modifier = Modifier.size(120.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(100.dp)
                .graphicsLayer {
                    val scale = 1f + amplitude * 0.24f
                    scaleX = scale
                    scaleY = scale
                }
                .background(
                    MaterialTheme.colorScheme.action.copy(alpha = if (active) 0.12f else 0.06f),
                    CircleShape,
                ),
        )
        Surface(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer {
                    val scale = 1f + amplitude * 0.06f
                    scaleX = scale
                    scaleY = scale
                },
            shape = CircleShape,
            color = if (active) {
                MaterialTheme.colorScheme.action
            } else {
                MaterialTheme.colorScheme.interactiveSurface
            },
            contentColor = if (active) {
                MaterialTheme.colorScheme.onAction
            } else {
                MaterialTheme.colorScheme.contentMuted
            },
            shadowElevation = if (active) 2.dp else 0.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    painter = painterResource(R.drawable.ic_mic_24),
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                )
            }
        }
    }
}

@Composable
internal fun VoiceControlButton(
    enabled: Boolean,
    iconRes: Int,
    contentDescription: String,
    emphasized: Boolean = false,
    size: Dp = 52.dp,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.size(size),
        shape = CircleShape,
        color = when {
            emphasized -> MaterialTheme.colorScheme.action
            else -> MaterialTheme.colorScheme.interactiveSurface
        },
        contentColor = when {
            !enabled -> MaterialTheme.colorScheme.contentMuted.copy(alpha = 0.38f)
            emphasized -> MaterialTheme.colorScheme.onAction
            else -> MaterialTheme.colorScheme.contentStrong
        },
    ) {
        IconButton(enabled = enabled, onClick = onClick) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}
