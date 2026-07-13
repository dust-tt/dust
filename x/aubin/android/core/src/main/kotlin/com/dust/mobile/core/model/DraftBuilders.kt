package com.dust.mobile.core.model

fun contentWithSkillTags(content: String, capabilities: List<Capability>): String {
    val tags = capabilities.mapNotNull { capability ->
        val skill = (capability as? Capability.SkillCapability)?.skill ?: return@mapNotNull null
        val icon = skill.icon?.let { " icon=\"$it\"" }.orEmpty()
        "<skill id=\"${skill.sId}\" name=\"${skill.name}\"$icon />"
    }
    return if (tags.isEmpty()) content else (listOf(content) + tags).joinToString("\n")
}

fun selectedToolIds(capabilities: List<Capability>): List<String> =
    capabilities.mapNotNull { capability -> (capability as? Capability.Tool)?.serverView?.sId }

fun nextBlockedActionStreamMessageId(
    currentStreamingMessageId: String?,
    blockedActionMessageId: String?,
): String? =
    if (currentStreamingMessageId == null) blockedActionMessageId else null

fun reconciledBlockedState(
    currentBlockedState: BlockedState?,
    blockedAction: BlockedAction,
    fallbackConversationId: String,
): BlockedState? =
    blockedAction.toBlockedState(fallbackConversationId) ?: currentBlockedState

fun BlockedAction.toBlockedState(fallbackConversationId: String): BlockedState? =
    when (status) {
        BlockedActionStatus.BLOCKED_VALIDATION_REQUIRED ->
            BlockedState.Approval(ToolApprovalInfo.from(this, fallbackConversationId))

        BlockedActionStatus.BLOCKED_AUTHENTICATION_REQUIRED ->
            BlockedState.PersonalAuth(
                provider = metadata?.mcpServerName ?: "Unknown",
                toolName = metadata?.toolName.orEmpty(),
            )

        BlockedActionStatus.BLOCKED_FILE_AUTHORIZATION_REQUIRED ->
            BlockedState.FileAuth(
                fileName = fileAuthorizationInfo?.fileName ?: "Unknown",
                toolName = fileAuthorizationInfo?.toolName ?: metadata?.toolName.orEmpty(),
            )

        BlockedActionStatus.BLOCKED_USER_ANSWER_REQUIRED -> {
            val question = question ?: return null
            BlockedState.UserQuestionRequired(UserQuestionInfo.from(this, question, fallbackConversationId))
        }

        BlockedActionStatus.BLOCKED_CHILD_ACTION_INPUT_REQUIRED -> null
    }

fun StreamingEventData.toBlockedState(messageId: String, fallbackConversationId: String): BlockedState? =
    when (this) {
        is StreamingEventData.ToolApproveExecution -> BlockedState.Approval(
            ToolApprovalInfo.from(event, fallbackMessageId = messageId, fallbackConversationId = fallbackConversationId),
        )

        is StreamingEventData.ToolPersonalAuthRequired -> BlockedState.PersonalAuth(
            provider = event.authError.provider,
            toolName = event.authError.toolName,
        )

        is StreamingEventData.ToolFileAuthRequired -> BlockedState.FileAuth(
            fileName = event.fileAuthError.fileName,
            toolName = event.fileAuthError.toolName,
        )

        is StreamingEventData.ToolAskUserQuestion -> BlockedState.UserQuestionRequired(
            UserQuestionInfo.from(event, fallbackMessageId = messageId, fallbackConversationId = fallbackConversationId),
        )

        else -> null
    }
