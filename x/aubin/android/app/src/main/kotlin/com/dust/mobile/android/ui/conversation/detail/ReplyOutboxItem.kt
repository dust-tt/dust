package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.ui.composer.UploadedAttachment
import com.dust.mobile.android.ui.composer.buildMessageContext
import com.dust.mobile.android.ui.composer.replyContentFragmentPayloads
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.contentWithSkillTags
import com.dust.mobile.core.model.replyAgentConfigurationId

internal fun buildReplyOutboxItem(
    clientRequestId: String,
    workspaceId: String,
    conversationId: String,
    sentDraft: String,
    text: String,
    state: ConversationDetailState,
    uploadedAttachments: List<UploadedAttachment>,
    user: User,
): PersistedOutboxItem = PersistedOutboxItem(
    id = clientRequestId,
    kind = PersistedOutboxKind.POST_MESSAGE,
    workspaceId = workspaceId,
    conversationId = conversationId,
    messageRequest = PostMessageRequest(
        content = contentWithSkillTags(text, state.selectedCapabilities),
        mentions = listOf(
            MentionPayload(state.selectedReplyAgent?.sId ?: replyAgentConfigurationId(state.messages)),
        ),
        context = buildMessageContext(state.selectedCapabilities, user.profilePictureUrl),
    ),
    contentFragments = replyContentFragmentPayloads(
        uploadedAttachments = uploadedAttachments,
        profilePictureUrl = user.profilePictureUrl,
    ),
    displayText = sentDraft,
    createdAtEpochMillis = System.currentTimeMillis(),
)
