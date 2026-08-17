package com.dust.mobile.android.ui.message

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.SkeletonBlock
import com.dust.mobile.android.ui.common.loadingPulseAlpha
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.iconLabelForContentType
import com.dust.mobile.core.model.isImageContentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun ContentFragmentChips(
    fragments: List<ContentFragment>,
    onOpen: ((ContentFragment) -> Unit)?,
    loadImage: (suspend (String) -> ByteArray?)?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        fragments.forEach { fragment ->
            val fileId = fragment.fileId
            if (fragment.isImage && fileId != null && loadImage != null) {
                AttachmentImagePreview(
                    fragment = fragment,
                    fileId = fileId,
                    loadImage = loadImage,
                    onOpen = onOpen,
                )
            } else {
                ContentFragmentChip(fragment = fragment, onOpen = onOpen)
            }
        }
    }
}

@Composable
private fun AttachmentImagePreview(
    fragment: ContentFragment,
    fileId: String,
    loadImage: suspend (String) -> ByteArray?,
    onOpen: ((ContentFragment) -> Unit)?,
) {
    var imageState by remember(fileId) { mutableStateOf<AttachmentImageState>(AttachmentImageState.Loading) }
    LaunchedEffect(fileId, loadImage) {
        val imageData = loadImage(fileId)
        val bitmap = imageData?.let { data ->
            withContext(Dispatchers.Default) { decodeAttachmentThumbnail(data) }
        }
        imageState = if (bitmap == null) {
            AttachmentImageState.Failed
        } else {
            AttachmentImageState.Loaded(bitmap)
        }
    }
    when (val current = imageState) {
        AttachmentImageState.Loading -> SkeletonBlock(
            alpha = loadingPulseAlpha(),
            modifier = Modifier.size(72.dp),
            shape = RoundedCornerShape(8.dp),
        )
        AttachmentImageState.Failed -> ContentFragmentChip(fragment = fragment, onOpen = onOpen)
        is AttachmentImageState.Loaded -> Image(
            bitmap = current.bitmap.asImageBitmap(),
            contentDescription = fragment.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(enabled = onOpen != null) { onOpen?.invoke(fragment) },
        )
    }
}

private sealed interface AttachmentImageState {
    data object Loading : AttachmentImageState
    data object Failed : AttachmentImageState
    data class Loaded(val bitmap: Bitmap) : AttachmentImageState
}

private fun decodeAttachmentThumbnail(data: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 256 || bounds.outHeight / sampleSize > 256) {
        sampleSize *= 2
    }
    return BitmapFactory.decodeByteArray(
        data,
        0,
        data.size,
        BitmapFactory.Options().apply { inSampleSize = sampleSize },
    )
}

@Composable
private fun ContentFragmentChip(
    fragment: ContentFragment,
    onOpen: ((ContentFragment) -> Unit)?,
) {
    DocumentLink(
        label = fragment.title,
        contentType = fragment.contentType,
        enabled = fragment.fileId != null && onOpen != null,
        onClick = { onOpen?.invoke(fragment) },
    )
}

@Composable
internal fun GeneratedFileChips(
    files: List<GeneratedFile>,
    onOpen: ((GeneratedFile) -> Unit)?,
) {
    Column {
        files.forEachIndexed { index, file ->
            if (index > 0) {
                HorizontalDivider(
                    modifier = Modifier.padding(start = 32.dp),
                    color = MaterialTheme.colorScheme.subtleBorder,
                )
            }
            DocumentLink(
                label = file.title,
                contentType = file.contentType,
                enabled = file.fileId != null && onOpen != null,
                onClick = { onOpen?.invoke(file) },
            )
        }
    }
}

@Composable
private fun DocumentLink(
    label: String,
    contentType: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val isFrame = contentType.startsWith(FRAME_CONTENT_TYPE_PREFIX)
    val contentColor = if (enabled) {
        MaterialTheme.colorScheme.onSurface
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(
                when {
                    isFrame -> R.drawable.ic_frame_24
                    isImageContentType(contentType) -> R.drawable.ic_image_24
                    else -> R.drawable.ic_document_24
                },
            ),
            contentDescription = null,
            modifier = Modifier.size(22.dp),
            tint = if (isFrame && enabled) {
                MaterialTheme.colorScheme.action
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelLarge,
                color = contentColor,
            )
            Text(
                if (isFrame) "Frames" else iconLabelForContentType(contentType),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (enabled) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
