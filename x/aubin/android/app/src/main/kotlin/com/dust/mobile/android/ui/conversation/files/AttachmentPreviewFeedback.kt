package com.dust.mobile.android.ui.conversation.files

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustFeedbackState

@Composable
internal fun PreviewLoadError(message: String) {
    DustFeedbackState(
        iconRes = R.drawable.ic_error_24,
        title = "Preview unavailable",
        message = message,
        modifier = Modifier.fillMaxSize(),
    )
}
