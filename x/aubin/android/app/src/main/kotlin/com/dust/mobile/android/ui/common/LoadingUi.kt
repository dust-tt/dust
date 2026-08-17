package com.dust.mobile.android.ui.common

import android.provider.Settings
import androidx.annotation.DrawableRes
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import kotlinx.coroutines.delay

@Composable
internal fun LoadingScreen(message: String = "Loading") {
    val pulseAlpha = loadingPulseAlpha()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.dust_logo),
            contentDescription = stringResource(R.string.dust_logo_content_description),
            modifier = Modifier
                .size(width = 112.dp, height = 28.dp)
                .graphicsLayer {
                    alpha = pulseAlpha
                },
        )
        if (message != "Loading") {
            Spacer(Modifier.height(16.dp))
            Text(
                message,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun motionEnabled(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) > 0f
    }
}

@Composable
internal fun loadingPulseAlpha(): Float {
    if (!motionEnabled()) return 0.5f
    val pulse = rememberInfiniteTransition(label = "loading-pulse")
    val alpha by pulse.animateFloat(
        initialValue = 0.32f,
        targetValue = 0.58f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = SKELETON_PULSE_MS, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "loading-pulse-alpha",
    )
    return alpha
}

@Composable
internal fun Modifier.activeStatusPulse(active: Boolean = true): Modifier {
    if (!active || !motionEnabled()) return this

    val transition = rememberInfiniteTransition(label = "active-status-pulse")
    val scale by transition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = ACTIVE_STATUS_PULSE_MS, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "active-status-pulse-scale",
    )
    val alpha by transition.animateFloat(
        initialValue = 0.62f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = ACTIVE_STATUS_PULSE_MS, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "active-status-pulse-alpha",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
        this.alpha = alpha
    }
}

@Composable
internal fun LoadingPlaceholder(
    @DrawableRes iconRes: Int,
    label: String,
    modifier: Modifier = Modifier,
    delayMs: Long = LOADING_PLACEHOLDER_DELAY_MS,
) {
    var visible by remember(iconRes, label) { mutableStateOf(false) }
    val iconAlpha = 0.55f + loadingPulseAlpha() * 0.4f
    LaunchedEffect(iconRes, label, delayMs) {
        delay(delayMs)
        visible = true
    }
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (visible) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    painter = painterResource(iconRes),
                    contentDescription = null,
                    modifier = Modifier
                        .size(28.dp)
                        .graphicsLayer { alpha = iconAlpha },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
internal fun <T> ContentCrossfade(
    targetState: T,
    label: String,
    modifier: Modifier = Modifier,
    content: @Composable (T) -> Unit,
) {
    Crossfade(
        targetState = targetState,
        modifier = modifier,
        animationSpec = tween(
            durationMillis = if (motionEnabled()) CONTENT_CROSSFADE_MS else 0,
            easing = LinearOutSlowInEasing,
        ),
        label = label,
        content = content,
    )
}

@Composable
internal fun SkeletonBlock(
    alpha: Float,
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(6.dp),
) {
    Box(
        modifier = modifier
            .clearAndSetSemantics { }
            .graphicsLayer { this.alpha = alpha }
            .background(MaterialTheme.colorScheme.surfaceContainerHighest, shape),
    )
}

private const val CONTENT_CROSSFADE_MS = 160
private const val SKELETON_PULSE_MS = 1_100
private const val ACTIVE_STATUS_PULSE_MS = 900
private const val LOADING_PLACEHOLDER_DELAY_MS = 160L
