package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import com.dust.mobile.android.ui.frame.FrameContentView
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.repository.FrameFileContent

@Composable
internal fun PodPinnedFrame(
    file: PodFileEntry,
    code: String?,
    isLoading: Boolean,
    error: String?,
    appUrl: String,
    vizUrl: String,
    fetchFile: suspend (String) -> FrameFileContent,
    onOpen: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(DustRadii.control)
    androidx.compose.foundation.layout.Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = DustSpacing.large, vertical = DustSpacing.small)
            .clip(shape)
            .background(MaterialTheme.colorScheme.boundedSurface)
            .border(1.dp, MaterialTheme.colorScheme.subtleBorder, shape),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .padding(start = DustSpacing.medium, end = DustSpacing.extraSmall),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_pin_24),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
            Text(
                text = file.fileName,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = DustSpacing.small),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelLarge,
            )
            DustIconButton(
                onClick = onOpen,
                iconRes = R.drawable.ic_fullscreen_24,
                contentDescription = "Open pinned Frame",
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(196.dp)
                .background(MaterialTheme.colorScheme.background),
        ) {
            when {
                isLoading -> LoadingPlaceholder(R.drawable.ic_frame_24, "Loading Frame")
                error != null -> DustFeedbackState(
                    iconRes = R.drawable.ic_frame_24,
                    title = "Frame unavailable",
                    message = error,
                    actionLabel = "Reload",
                    onAction = onRetry,
                    modifier = Modifier.fillMaxSize(),
                )
                code != null && file.fileId != null -> FrameContentView(
                    code = code,
                    fileId = requireNotNull(file.fileId),
                    appUrl = appUrl,
                    vizUrl = vizUrl,
                    fetchFile = fetchFile,
                    compact = true,
                )
            }
        }
    }
}
