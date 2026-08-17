package com.dust.mobile.android.quicksettings

import android.app.StatusBarManager
import android.content.ComponentName
import android.graphics.drawable.Icon
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.dust.mobile.android.R

internal data class QuickSettingsTilePinAction(
    val isSupported: Boolean,
    val request: () -> Unit,
)

@Composable
internal fun rememberQuickSettingsTilePinAction(): QuickSettingsTilePinAction {
    val context = LocalContext.current
    val isSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    return remember(context, isSupported) {
        QuickSettingsTilePinAction(
            isSupported = isSupported,
            request = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestTilePin(context)
                }
            },
        )
    }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private fun requestTilePin(context: android.content.Context) {
    context.getSystemService(StatusBarManager::class.java).requestAddTileService(
        ComponentName(context, AskDustTileService::class.java),
        context.getString(R.string.ask_dust_tile_label),
        Icon.createWithResource(context, R.drawable.ic_edit_24),
        context.mainExecutor,
    ) {}
}
