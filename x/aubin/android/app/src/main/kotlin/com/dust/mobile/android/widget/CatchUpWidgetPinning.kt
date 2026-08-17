package com.dust.mobile.android.widget

import android.appwidget.AppWidgetManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import kotlinx.coroutines.launch

internal data class CatchUpWidgetPinAction(
    val isSupported: Boolean,
    val request: () -> Unit,
)

@Composable
internal fun rememberCatchUpWidgetPinAction(): CatchUpWidgetPinAction {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isSupported = remember(context) {
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }
    return remember(context, scope, isSupported) {
        CatchUpWidgetPinAction(
            isSupported = isSupported,
            request = {
                scope.launch {
                    GlanceAppWidgetManager(context).requestPinGlanceAppWidget(
                        receiver = CatchUpWidgetReceiver::class.java,
                        preview = CatchUpWidget(),
                        previewSize = DpSize(280.dp, 170.dp),
                        previewState = null,
                    )
                }
            },
        )
    }
}
