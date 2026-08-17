package com.dust.mobile.android.ui.conversation.files

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun ImagePreview(title: String, data: ByteArray) {
    var state by remember(data) { mutableStateOf<ImagePreviewState>(ImagePreviewState.Loading) }
    LaunchedEffect(data) {
        state = withContext(Dispatchers.Default) {
            BitmapFactory.decodeByteArray(data, 0, data.size)
                ?.let(ImagePreviewState::Ready)
                ?: ImagePreviewState.Failed
        }
    }
    val bitmap = (state as? ImagePreviewState.Ready)?.bitmap
    DisposableEffect(bitmap) {
        onDispose { bitmap?.recycle() }
    }

    when (val current = state) {
        ImagePreviewState.Loading -> LoadingPlaceholder(
            iconRes = R.drawable.ic_image_24,
            label = "Loading image",
        )
        ImagePreviewState.Failed -> PreviewLoadError("Could not decode this image")
        is ImagePreviewState.Ready -> ZoomableImage(title = title, bitmap = current.bitmap)
    }
}

@Composable
private fun ZoomableImage(title: String, bitmap: Bitmap) {
    var scale by remember(bitmap) { mutableStateOf(1f) }
    var offset by remember(bitmap) { mutableStateOf(Offset.Zero) }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clipToBounds()
            .pointerInput(bitmap) {
                detectTransformGestures { _, pan, zoom, _ ->
                    val nextScale = (scale * zoom).coerceIn(1f, 5f)
                    scale = nextScale
                    offset = if (nextScale == 1f) Offset.Zero else offset + pan
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = "Image preview for $title",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y
                },
        )
    }
}

private sealed interface ImagePreviewState {
    data object Loading : ImagePreviewState
    data object Failed : ImagePreviewState
    data class Ready(val bitmap: Bitmap) : ImagePreviewState
}
