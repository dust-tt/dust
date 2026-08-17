package com.dust.mobile.android.widget

import androidx.compose.runtime.Composable
import androidx.glance.LocalContext
import androidx.glance.preview.ExperimentalGlancePreviewApi
import androidx.glance.preview.Preview

@OptIn(ExperimentalGlancePreviewApi::class)
@Preview(widthDp = 180, heightDp = 110)
@Preview(widthDp = 280, heightDp = 170)
@Preview(widthDp = 320, heightDp = 260)
@Composable
internal fun CatchUpWidgetStudioPreview() {
    CatchUpWidgetContent(
        context = LocalContext.current,
        state = CatchUpWidgetRenderState(
            appWidgetId = null,
            isAuthenticated = true,
            snapshot = catchUpWidgetPreviewSnapshot,
        ),
    )
}
