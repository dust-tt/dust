package com.dust.mobile.android.ui.navigation

import com.dust.mobile.core.config.DeepLinkTarget

internal val DeepLinkTarget.workspaceIdOrNull: String?
    get() = when (this) {
        is DeepLinkTarget.Conversation -> workspaceId
        is DeepLinkTarget.NewConversation -> workspaceId
        is DeepLinkTarget.Pod -> workspaceId
        else -> null
    }

internal fun DeepLinkTarget.appActionDestination(state: com.dust.mobile.android.ui.inbox.ConversationListState): Destination? =
    when (this) {
        is DeepLinkTarget.NewConversation -> Destination.Compose(preferredAgentId = agentId)
        DeepLinkTarget.CatchUp -> state.unreadConversations
            .takeIf { it.isNotEmpty() }
            ?.let(Destination::CatchUp)
            ?: Destination.List
        else -> null
    }
