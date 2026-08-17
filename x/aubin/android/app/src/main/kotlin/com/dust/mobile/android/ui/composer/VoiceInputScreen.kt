package com.dust.mobile.android.ui.composer

import android.graphics.drawable.ColorDrawable
import android.view.ViewGroup
import android.view.WindowManager
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustAvatar
import com.dust.mobile.android.ui.common.motionEnabled

@Composable
internal fun VoiceInputScreen(
    state: SpeechInputState,
    text: String,
    canSend: Boolean,
    displayText: String = text,
    statusText: String? = null,
    statusIsError: Boolean = false,
    isWaitingForResponse: Boolean = false,
    isSpeaking: Boolean = false,
    canStartListening: Boolean = true,
    agentName: String? = null,
    agentAvatarUrl: String? = null,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onExit: () -> Unit,
    onSend: () -> Unit,
) {
    val transcriptScroll = rememberScrollState()
    LaunchedEffect(displayText) {
        withFrameNanos { }
        transcriptScroll.scrollTo(transcriptScroll.maxValue)
    }
    val status = statusText ?: when {
        state.error != null -> state.error
        state.isConnecting -> "Connecting..."
        state.isFinalizing -> "Finishing up..."
        state.isRecording -> "Listening..."
        text.isBlank() -> "Tap to speak"
        else -> "Paused - send or keep recording"
    }

    Dialog(
        onDismissRequest = onExit,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = true,
        ),
    ) {
        val dialogView = LocalView.current
        val dialogBackground = MaterialTheme.colorScheme.background
        SideEffect {
            (dialogView.parent as? DialogWindowProvider)?.window?.let { window ->
                window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                window.setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                window.setBackgroundDrawable(ColorDrawable(dialogBackground.toArgb()))
                window.decorView.elevation = 0f
                WindowCompat.setDecorFitsSystemWindows(window, true)
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    val useDarkIcons = dialogBackground.luminance() > 0.5f
                    isAppearanceLightStatusBars = useDarkIcons
                    isAppearanceLightNavigationBars = useDarkIcons
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .safeDrawingPadding()
                    .padding(horizontal = 24.dp, vertical = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (!agentName.isNullOrBlank()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 24.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        DustAvatar(
                            name = agentName,
                            avatarUrl = agentAvatarUrl,
                            size = 32.dp,
                            isAgent = true,
                        )
                        Text(
                            text = agentName,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .heightIn(max = 180.dp)
                        .fillMaxWidth()
                        .verticalScroll(transcriptScroll),
                    contentAlignment = Alignment.TopStart,
                ) {
                    Text(
                        text = displayText,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Normal,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.weight(1f))
                VoicePulse(
                    level = if (isSpeaking) 0.3f else state.audioLevel,
                    active = state.isRecording || isSpeaking,
                )
                Spacer(Modifier.height(24.dp))
                Text(
                    text = status.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (state.error == null && !statusIsError) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.weight(1f))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    VoiceControlButton(
                        enabled = true,
                        iconRes = R.drawable.ic_expand_more_24,
                        contentDescription = "Exit voice input",
                        size = 52.dp,
                        onClick = onExit,
                    )
                    VoiceRecordButton(
                        isRecording = state.isRecording,
                        enabled = canStartListening && !state.isConnecting && !state.isFinalizing,
                        startContentDescription = if (isSpeaking) {
                            "Interrupt and speak"
                        } else {
                            "Start recording"
                        },
                        onStart = onStart,
                        onStop = onStop,
                    )
                    VoiceControlButton(
                        enabled = !state.isBusy && !isWaitingForResponse && !isSpeaking && canSend,
                        iconRes = R.drawable.ic_arrow_up_24,
                        contentDescription = "Send message",
                        emphasized = true,
                        size = 52.dp,
                        onClick = onSend,
                    )
                }
                // Full-screen dialog windows can be shifted below the status bar while retaining
                // full-display height, so reserve enough space to keep controls above gesture UI.
                Spacer(Modifier.height(68.dp))
            }
        }
    }
}
