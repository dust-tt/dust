package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.persistence.PersistedAttachment
import com.dust.mobile.android.data.persistence.PersistedDraft

internal fun ComposeState.toPersistedDraft(): PersistedDraft = PersistedDraft(
    text = text,
    selectedAgentId = selectedAgent?.sId,
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

internal fun ComposeState.restoreDraftContent(draft: PersistedDraft): ComposeState = copy(
    text = draft.text,
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

internal fun ComposeState.restoreDraftSelections(draft: PersistedDraft): ComposeState = copy(
    selectedAgent = agents.find { it.sId == draft.selectedAgentId } ?: selectedAgent,
    selectedCapabilities = availableCapabilities.filter { it.id in draft.selectedCapabilityIds },
)
