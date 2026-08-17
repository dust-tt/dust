package com.dust.mobile.core.model

fun canSendMessage(
    text: String,
    hasAttachments: Boolean,
    hasSkillReferences: Boolean = false,
    hasFailedUploads: Boolean = false,
    isSending: Boolean = false,
): Boolean =
    !isSending &&
        !hasFailedUploads &&
        (text.isNotBlank() || hasAttachments || hasSkillReferences)
