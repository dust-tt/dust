package com.dust.mobile.android.ui.frame

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.buildFrameWrapperHtml
import com.dust.mobile.core.repository.FrameFileContent
import kotlinx.coroutines.delay

@Composable
internal fun FrameContentView(
    code: String,
    fileId: String,
    appUrl: String,
    vizUrl: String,
    fetchFile: suspend (String) -> FrameFileContent,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    var error by remember(fileId) { mutableStateOf<String?>(null) }
    var isLoading by remember(fileId) { mutableStateOf(true) }
    var restartKey by remember(fileId) { mutableIntStateOf(0) }

    LaunchedEffect(fileId, restartKey, isLoading) {
        if (isLoading) {
            delay(FRAME_READY_TIMEOUT_MS)
            if (isLoading) {
                isLoading = false
                error = "This Frame is taking too long to load."
            }
        }
    }

    Box(
        modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .semantics { contentDescription = "Frame preview" },
    ) {
        key(restartKey) {
            FrameWebView(
                html = buildFrameWrapperHtml(code, fileId, vizUrl),
                baseUrl = appUrl,
                fetchFile = fetchFile,
                onFrameReady = {
                    isLoading = false
                    error = null
                },
                onFrameError = { message ->
                    isLoading = false
                    error = message.ifBlank { "This Frame could not be loaded." }
                },
                onLoadingChange = { loading ->
                    if (loading) {
                        isLoading = true
                        error = null
                    }
                },
            )
        }
        when {
            error != null -> FrameViewportError(
                message = error.orEmpty(),
                compact = compact,
                onRetry = {
                    error = null
                    isLoading = true
                    restartKey += 1
                },
            )
            isLoading -> LoadingPlaceholder(
                iconRes = R.drawable.ic_frame_24,
                label = "Loading Frame",
            )
        }
    }
}

@Composable
private fun FrameViewportError(
    message: String,
    compact: Boolean,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = if (compact) "Frame unavailable" else message,
            color = MaterialTheme.colorScheme.contentMuted,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (!compact) {
            Spacer(Modifier.height(DustSpacing.extraSmall))
            Text(
                text = "Reload the Frame to try again.",
                color = MaterialTheme.colorScheme.contentMuted,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Spacer(Modifier.height(DustSpacing.medium))
        DustButton(
            label = "Reload",
            onClick = onRetry,
            variant = DustButtonVariant.Outline,
        )
    }
}
