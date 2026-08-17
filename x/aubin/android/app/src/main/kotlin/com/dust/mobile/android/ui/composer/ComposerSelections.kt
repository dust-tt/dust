package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.KnowledgeItem

@Composable
internal fun ComposerSelections(
    attachments: List<AttachmentDraft>,
    selectedCapabilities: List<Capability>,
    selectedKnowledgeItems: List<KnowledgeItem>,
    onRemoveAttachment: (String) -> Unit,
    onRemoveCapability: (Capability) -> Unit,
    onRemoveKnowledgeItem: (KnowledgeItem) -> Unit,
) {
    if (
        attachments.isEmpty() &&
        selectedCapabilities.isEmpty() &&
        selectedKnowledgeItems.isEmpty()
    ) {
        return
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = DustSpacing.medium, vertical = DustSpacing.small),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
    ) {
        attachments.forEach { attachment ->
            RemovableComposerChip(
                label = attachment.fileName,
                onRemove = { onRemoveAttachment(attachment.id) },
            )
        }
        selectedCapabilities.forEach { capability ->
            RemovableComposerChip(
                label = capability.displayName,
                accent = capability is Capability.SkillCapability,
                onRemove = { onRemoveCapability(capability) },
            )
        }
        selectedKnowledgeItems.forEach { item ->
            RemovableComposerChip(
                label = item.title,
                onRemove = { onRemoveKnowledgeItem(item) },
            )
        }
    }
}
