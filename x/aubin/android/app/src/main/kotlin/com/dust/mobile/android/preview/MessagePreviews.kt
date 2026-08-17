package com.dust.mobile.android.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.message.BlockedActionCard
import com.dust.mobile.android.ui.message.MessageBubble
import com.dust.mobile.android.ui.preview.DustComponentPreviews
import com.dust.mobile.android.ui.preview.localPreviewAgentMessage
import com.dust.mobile.android.ui.preview.localPreviewCompletedSteps
import com.dust.mobile.android.ui.preview.localPreviewDustUser
import com.dust.mobile.android.ui.preview.localPreviewUser
import com.dust.mobile.android.ui.preview.localPreviewUserMessage
import com.dust.mobile.android.ui.theme.DustTheme
import com.dust.mobile.core.model.GeneratedFile

@DustComponentPreviews
@Composable
private fun MessageStatesPreview() {
    DustTheme {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            MessageBubble(
                message = localPreviewUserMessage(
                    sId = "preview-user-message",
                    rank = 0,
                    createdMs = PREVIEW_EPOCH_MS,
                    content = "Pull the open launch risks into a concise customer update.",
                ),
                currentUserEmail = localPreviewUser().email,
                currentUserSId = localPreviewDustUser().sId,
            )
            MessageBubble(
                message = localPreviewAgentMessage(
                    sId = "preview-agent-message",
                    rank = 1,
                    createdMs = PREVIEW_EPOCH_MS + 60_000,
                    content = "I found three launch risks. The owners are assigned, and the customer-ready summary is attached.",
                    generatedFiles = listOf(
                        GeneratedFile(
                            fileId = "preview-summary",
                            title = "Launch summary.md",
                            contentType = "text/markdown",
                        ),
                    ),
                ),
                currentUserEmail = localPreviewUser().email,
                currentUserSId = localPreviewDustUser().sId,
                completedSteps = localPreviewCompletedSteps(),
            )
        }
    }
}

@DustComponentPreviews
@Composable
private fun ApprovalPreview() {
    PreviewBlockedAction(previewApprovalState())
}

@DustComponentPreviews
@Composable
private fun QuestionPreview() {
    PreviewBlockedAction(previewQuestionState())
}

@Composable
private fun PreviewBlockedAction(blockedState: com.dust.mobile.core.model.BlockedState) {
    DustTheme {
        Column(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .padding(16.dp),
        ) {
            BlockedActionCard(
                blockedState = blockedState,
                isLoading = false,
                error = null,
                onValidate = {},
                onAnswer = {},
                onOpenInBrowser = {},
                currentUserSId = localPreviewDustUser().sId,
            )
        }
    }
}
