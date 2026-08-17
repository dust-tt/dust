package com.dust.mobile.android.ui.navigation

import androidx.compose.runtime.Composable
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustTopBar

@Composable
internal fun AuthenticatedTopBar(
    title: String,
    onBack: () -> Unit,
    onOpenFiles: (() -> Unit)? = null,
    onOpenInBrowser: (() -> Unit)? = null,
) {
    DustTopBar(
        title = title,
        onBack = onBack,
        actions = {
            if (onOpenFiles != null) {
                DustIconButton(
                    onClick = onOpenFiles,
                    iconRes = R.drawable.ic_folder_24,
                    contentDescription = "Open files and Frames",
                )
            }
            if (onOpenInBrowser != null) {
                DustIconButton(
                    onClick = onOpenInBrowser,
                    iconRes = R.drawable.ic_open_in_browser_24,
                    contentDescription = "Open in browser",
                )
            }
        },
    )
}
