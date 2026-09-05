package com.dust.mobile.android.ui.message

import android.content.Intent
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import kotlinx.coroutines.delay

@Composable
internal fun MessageResponseActions(content: String) {
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var copied by remember(content) { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPY_FEEDBACK_DURATION_MS)
            copied = false
        }
    }
    Row {
        DustIconButton(
            iconRes = if (copied) R.drawable.ic_check_24 else R.drawable.ic_copy_24,
            contentDescription = if (copied) "Response copied" else "Copy response",
            onClick = {
                clipboard.setText(AnnotatedString(content))
                copied = true
            },
        )
        DustIconButton(
            iconRes = R.drawable.ic_share_24,
            contentDescription = "Share response",
            onClick = {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, content)
                }
                context.startActivity(Intent.createChooser(intent, "Share response"))
            },
        )
    }
}

private const val COPY_FEEDBACK_DURATION_MS = 2_000L
