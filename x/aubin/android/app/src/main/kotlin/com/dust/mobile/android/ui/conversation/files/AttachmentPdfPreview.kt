package com.dust.mobile.android.ui.conversation.files

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun PdfPreview(data: ByteArray) {
    val context = LocalContext.current
    var state by remember(data) { mutableStateOf<PdfPreviewState>(PdfPreviewState.Loading) }
    LaunchedEffect(data) {
        state = withContext(Dispatchers.IO) {
            runCatching { renderPdfPages(context.cacheDir, data) }
                .fold(
                    onSuccess = { pages ->
                        if (pages.isEmpty()) PdfPreviewState.Failed else PdfPreviewState.Ready(pages)
                    },
                    onFailure = { PdfPreviewState.Failed },
                )
        }
    }
    val pages = (state as? PdfPreviewState.Ready)?.pages
    DisposableEffect(pages) {
        onDispose { pages?.forEach(Bitmap::recycle) }
    }

    when (val current = state) {
        PdfPreviewState.Loading -> LoadingPlaceholder(
            iconRes = R.drawable.ic_document_24,
            label = "Rendering PDF",
        )
        PdfPreviewState.Failed -> PreviewLoadError("Could not render this PDF")
        is PdfPreviewState.Ready -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(current.pages) { index, bitmap ->
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "PDF page ${index + 1} of ${current.pages.size}",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                )
            }
        }
    }
}

private sealed interface PdfPreviewState {
    data object Loading : PdfPreviewState
    data object Failed : PdfPreviewState
    data class Ready(val pages: List<Bitmap>) : PdfPreviewState
}

private fun renderPdfPages(cacheDir: File, data: ByteArray): List<Bitmap> {
    val file = File.createTempFile("dust-preview", ".pdf", cacheDir)
    return try {
        file.writeBytes(data)
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
            PdfRenderer(descriptor).use { renderer ->
                (0 until renderer.pageCount).map { index ->
                    renderer.openPage(index).use { page ->
                        Bitmap.createBitmap(
                            page.width * 2,
                            page.height * 2,
                            Bitmap.Config.ARGB_8888,
                        ).also { bitmap ->
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        }
                    }
                }
            }
        }
    } finally {
        file.delete()
    }
}
