package com.dust.mobile.core.model

const val DEFAULT_AGENT_CONFIGURATION_ID = "dust"

fun replyAgentConfigurationId(
    messages: List<ConversationMessage>,
    defaultAgentId: String = DEFAULT_AGENT_CONFIGURATION_ID,
): String =
    messages.asReversed()
        .filterIsInstance<ConversationMessage.Agent>()
        .firstOrNull()
        ?.message
        ?.configuration
        ?.sId
        ?: defaultAgentId

fun retargetReplyAgentForMessages(
    previousMessages: List<ConversationMessage>,
    nextMessages: List<ConversationMessage>,
    agents: List<LightAgentConfiguration>,
    selectedAgent: LightAgentConfiguration?,
    defaultAgentId: String = DEFAULT_AGENT_CONFIGURATION_ID,
): LightAgentConfiguration? {
    val previousAgentId = replyAgentConfigurationId(previousMessages, defaultAgentId)
    val nextAgentId = replyAgentConfigurationId(nextMessages, defaultAgentId)
    if (nextAgentId == previousAgentId) {
        return selectedAgent
    }

    return agents.firstOrNull { it.sId == nextAgentId } ?: selectedAgent
}
