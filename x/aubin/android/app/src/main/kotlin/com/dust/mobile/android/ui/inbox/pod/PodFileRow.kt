package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.formatFileSize

@Composable
internal fun PodFileRow(
    file: PodFileEntry,
    isPinnedFrame: Boolean,
    canPinFrames: Boolean,
    onOpen: () -> Unit,
    onTogglePinnedFrame: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clickable(enabled = file.isDirectory || file.fileId != null, onClick = onOpen)
            .padding(start = DustSpacing.large, end = DustSpacing.extraSmall),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(file.iconRes()),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = if (isPinnedFrame) MaterialTheme.colorScheme.action else MaterialTheme.colorScheme.contentMuted,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = DustSpacing.medium),
        ) {
            Text(
                text = file.fileName,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            if (!file.isDirectory) {
                Text(
                    text = if (isPinnedFrame) "Pinned Frame · ${formatFileSize(file.sizeBytes)}" else formatFileSize(file.sizeBytes),
                    color = MaterialTheme.colorScheme.contentMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        when {
            file.isFrame && canPinFrames -> DustIconButton(
                onClick = onTogglePinnedFrame,
                iconRes = R.drawable.ic_pin_24,
                contentDescription = if (isPinnedFrame) "Unpin Frame" else "Pin Frame",
                variant = if (isPinnedFrame) DustIconButtonVariant.Selected else DustIconButtonVariant.Plain,
            )
            file.isDirectory -> Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier
                    .padding(end = DustSpacing.medium)
                    .size(20.dp),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}

private fun PodFileEntry.iconRes(): Int =
    when {
        isDirectory -> R.drawable.ic_folder_24
        isFrame -> R.drawable.ic_frame_24
        contentType?.startsWith("image/") == true -> R.drawable.ic_image_24
        else -> R.drawable.ic_document_24
    }
