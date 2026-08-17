package com.dust.mobile.android.preview

import androidx.compose.runtime.Composable
import com.dust.mobile.android.ui.conversation.files.ConversationFilesContent
import com.dust.mobile.android.ui.conversation.files.ConversationFilesState
import com.dust.mobile.android.ui.preview.DustScreenPreviews
import com.dust.mobile.android.ui.preview.localPreviewAttachments
import com.dust.mobile.android.ui.theme.DustTheme

@DustScreenPreviews
@Composable
private fun ConversationFilesPreview() {
    DustTheme {
        ConversationFilesContent(
            state = ConversationFilesState(
                isLoading = false,
                attachments = localPreviewAttachments("preview-conversation"),
            ),
            onRetry = {},
            onOpenAttachment = {},
        )
    }
}
