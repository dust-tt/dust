package com.dust.mobile.android.ui.composer

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.canSendMessage

data class ComposeState(
    val text: String = "",
    val agents: List<LightAgentConfiguration> = emptyList(),
    val selectedAgent: LightAgentConfiguration? = null,
    val availableCapabilities: List<Capability> = emptyList(),
    val selectedCapabilities: List<Capability> = emptyList(),
    val knowledgeQuery: String = "",
    val knowledgeResults: List<KnowledgeItem> = emptyList(),
    val selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    val attachments: List<AttachmentDraft> = emptyList(),
    val isLoadingOptions: Boolean = false,
    val isLoadingSkills: Boolean = false,
    val isSearchingKnowledge: Boolean = false,
    val isDraftRestored: Boolean = false,
    val isSending: Boolean = false,
    val pendingOutboxId: String? = null,
    val createdConversation: Conversation? = null,
    val error: String? = null,
) {
    val canSend: Boolean
        get() = selectedAgent != null && pendingOutboxId == null &&
            !isLoadingOptions &&
            canSendMessage(
                text = text,
                hasAttachments = attachments.isNotEmpty(),
                hasSkillReferences = selectedCapabilities.any { it is Capability.SkillCapability },
                hasFailedUploads = attachments.hasFailedUploads,
                isSending = isSending,
            )
}

internal fun ComposeState.clearedDraft(): ComposeState =
    copy(
        text = "",
        selectedAgent = agents.firstOrNull { agent -> agent.sId == DEFAULT_AGENT_CONFIGURATION_ID }
            ?: agents.firstOrNull(),
        selectedCapabilities = emptyList(),
        knowledgeQuery = "",
        knowledgeResults = emptyList(),
        selectedKnowledgeItems = emptyList(),
        attachments = emptyList(),
        isSearchingKnowledge = false,
        isSending = false,
        pendingOutboxId = null,
        createdConversation = null,
        error = null,
    )

internal fun ComposeState.sentSuccessfully(): ComposeState =
    copy(
        text = "",
        selectedCapabilities = emptyList(),
        knowledgeQuery = "",
        knowledgeResults = emptyList(),
        selectedKnowledgeItems = emptyList(),
        attachments = emptyList(),
        isSearchingKnowledge = false,
        isSending = false,
        pendingOutboxId = null,
        error = null,
    )
