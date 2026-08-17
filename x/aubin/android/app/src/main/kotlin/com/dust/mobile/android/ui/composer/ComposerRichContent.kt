package com.dust.mobile.android.ui.composer

import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.content.ReceiveContentListener
import androidx.compose.foundation.content.consume
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun rememberAttachmentContentReceiver(
    enabled: Boolean,
    onReceiveAttachments: (List<Uri>) -> Unit,
): ReceiveContentListener {
    val currentEnabled = rememberUpdatedState(enabled)
    val currentOnReceiveAttachments = rememberUpdatedState(onReceiveAttachments)

    return remember {
        ReceiveContentListener { content ->
            if (!currentEnabled.value) {
                return@ReceiveContentListener content
            }

            val attachmentUris = mutableListOf<Uri>()
            val remainingContent = content.consume { item ->
                item.uri?.let { uri ->
                    attachmentUris += uri
                    true
                } ?: false
            }
            if (attachmentUris.isNotEmpty()) {
                currentOnReceiveAttachments.value(attachmentUris)
            }
            remainingContent
        }
    }
}
