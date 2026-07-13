package com.dust.mobile.core.model

fun canSendMessage(
    text: String,
    hasAttachments: Boolean,
    hasFailedUploads: Boolean = false,
    isSending: Boolean = false,
): Boolean =
    !isSending &&
        !hasFailedUploads &&
        (text.isNotBlank() || hasAttachments)
