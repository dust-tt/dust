package com.dust.mobile.android.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.composer.AttachmentDraft
import com.dust.mobile.android.ui.composer.ComposerBar
import com.dust.mobile.android.ui.composer.ComposerFocusCoordinator
import com.dust.mobile.android.ui.preview.DustComponentPreviews
import com.dust.mobile.android.ui.preview.localPreviewAgents
import com.dust.mobile.android.ui.preview.localPreviewCapabilities
import com.dust.mobile.android.ui.preview.localPreviewKnowledgeItems
import com.dust.mobile.android.ui.theme.DustTheme
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration

@DustComponentPreviews
@Composable
private fun EmptyComposerPreview() {
    PreviewComposer(text = "", canSend = false)
}

@DustComponentPreviews
@Composable
private fun MentionComposerPreview() {
    PreviewComposer(text = "Ask @sa", focused = true, canSend = true)
}

@DustComponentPreviews
@Composable
private fun ContextComposerPreview() {
    val capabilities = localPreviewCapabilities("local-workspace")
    PreviewComposer(
        text = "Turn the latest notes into a customer-ready briefing.",
        selectedAgent = localPreviewAgents()[1],
        attachments = previewAttachmentDrafts(),
        selectedCapabilities = listOf(capabilities.last()),
        selectedKnowledgeItems = localPreviewKnowledgeItems("account").take(1),
        canSend = true,
    )
}

@DustComponentPreviews
@Composable
private fun SendingComposerPreview() {
    PreviewComposer(
        text = "Send the approved customer summary.",
        selectedAgent = localPreviewAgents()[2],
        canSend = false,
        isSending = true,
        error = "The connection was interrupted. Your draft is safe.",
    )
}

@Composable
private fun PreviewComposer(
    text: String,
    focused: Boolean = false,
    selectedAgent: LightAgentConfiguration? = null,
    attachments: List<AttachmentDraft> = emptyList(),
    selectedCapabilities: List<Capability> = emptyList(),
    selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    canSend: Boolean,
    isSending: Boolean = false,
    error: String? = null,
) {
    DustTheme {
        val focusCoordinator = remember(focused) {
            ComposerFocusCoordinator().apply { onInputFocusChanged(focused) }
        }
        val agents = localPreviewAgents()
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(360.dp)
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.BottomCenter,
        ) {
            ComposerBar(
                text = text,
                onTextChange = {},
                focusCoordinator = focusCoordinator,
                agents = agents,
                selectedAgent = selectedAgent,
                onSelectAgent = {},
                attachments = attachments,
                onRemoveAttachment = {},
                availableCapabilities = localPreviewCapabilities("local-workspace"),
                selectedCapabilities = selectedCapabilities,
                onRemoveCapability = {},
                isLoadingSkills = false,
                onSelectSkill = {},
                selectedKnowledgeItems = selectedKnowledgeItems,
                onRemoveKnowledgeItem = {},
                enabled = true,
                canSend = canSend,
                isSending = isSending,
                error = error,
                onAddPhoto = {},
                onAddFile = {},
                onReceiveAttachments = {},
                onShowCapabilities = {},
                onShowKnowledge = {},
                onVoice = {},
                onSend = {},
            )
        }
    }
}
