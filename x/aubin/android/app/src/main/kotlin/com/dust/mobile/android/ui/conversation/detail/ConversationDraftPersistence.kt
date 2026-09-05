package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.persistence.PersistedAttachment
import com.dust.mobile.android.data.persistence.PersistedDraft
import com.dust.mobile.android.ui.composer.AttachmentDraft
import com.dust.mobile.android.ui.composer.AttachmentUploadState

internal fun ConversationDetailState.toPersistedReplyDraft(): PersistedDraft = PersistedDraft(
    text = replyText,
    selectedAgentId = selectedReplyAgent?.sId,
    selectedCapabilityIds = selectedCapabilities.map { it.id },
    selectedKnowledgeItems = selectedKnowledgeItems,
    attachments = attachments.mapNotNull { attachment ->
        attachment.fileId?.let { fileId ->
            PersistedAttachment(
                id = attachment.id,
                fileName = attachment.fileName,
                contentType = attachment.contentType,
                fileSize = attachment.fileSize,
                fileId = fileId,
            )
        }
    },
    pendingOutboxId = pendingOutboxId,
)

internal fun ConversationDetailState.restoreReplyDraftContent(draft: PersistedDraft): ConversationDetailState = copy(
    replyText = draft.text,
    selectedKnowledgeItems = draft.selectedKnowledgeItems,
    attachments = draft.attachments.map { attachment ->
        AttachmentDraft(
            id = attachment.id,
            fileName = attachment.fileName,
            contentType = attachment.contentType,
            fileSize = attachment.fileSize,
            data = ByteArray(0),
            uploadState = AttachmentUploadState.Uploaded(attachment.fileId),
        )
    },
    pendingOutboxId = draft.pendingOutboxId,
)

internal fun ConversationDetailState.restoreReplyDraftSelections(
    draft: PersistedDraft,
): ConversationDetailState = copy(
    selectedReplyAgent = agents.find { it.sId == draft.selectedAgentId } ?: selectedReplyAgent,
    selectedCapabilities = availableCapabilities.filter { it.id in draft.selectedCapabilityIds },
)
