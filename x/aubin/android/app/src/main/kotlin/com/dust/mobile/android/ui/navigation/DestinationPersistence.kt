package com.dust.mobile.android.ui.navigation

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedDestination
import com.dust.mobile.android.data.persistence.PersistedDestinationKind
import com.dust.mobile.android.ui.inbox.ConversationListState
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation

internal fun Destination.toPersistedDestination(): PersistedDestination =
    when (this) {
        Destination.List -> PersistedDestination()
        is Destination.Compose -> PersistedDestination(
            kind = PersistedDestinationKind.COMPOSE,
            agentId = preferredAgentId,
            returnTo = returnTo.toPersistedDestination(),
        )
        is Destination.CatchUp -> PersistedDestination(
            kind = PersistedDestinationKind.CATCH_UP,
            conversationIds = conversations.map { it.sId },
        )
        is Destination.Pod -> PersistedDestination(
            kind = PersistedDestinationKind.POD,
            spaceId = space.sId,
        )
        is Destination.PodCompose -> PersistedDestination(
            kind = PersistedDestinationKind.POD_COMPOSE,
            spaceId = space.sId,
        )
        is Destination.ConversationDetail -> PersistedDestination(
            kind = PersistedDestinationKind.CONVERSATION,
            conversationId = conversation.sId,
            returnTo = returnTo.toPersistedDestination(),
        )
        is Destination.ConversationFiles -> PersistedDestination(
            kind = PersistedDestinationKind.CONVERSATION_FILES,
            conversationId = conversation.sId,
            returnTo = returnTo.toPersistedDestination(),
        )
        is Destination.AttachmentViewer -> PersistedDestination(
            kind = PersistedDestinationKind.ATTACHMENT,
            title = title,
            contentType = contentType,
            fileId = fileId,
            sourceUrl = sourceUrl,
            returnTo = returnTo.toPersistedDestination(),
        )
    }

internal suspend fun PersistedDestination.restoreDestination(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    listState: ConversationListState,
): Destination {
    suspend fun conversation(id: String?): Conversation? {
        id ?: return null
        listState.conversations.find { it.sId == id }?.let { return it }
        if (isLocalPreview) return null
        return runCatching {
            graph.conversationRepository.fetchConversation(workspaceId, id, tokenProvider)
        }.getOrNull()
    }

    suspend fun returnDestination(): Destination = returnTo?.restoreDestination(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspaceId,
        listState = listState,
    ) ?: Destination.List

    return when (kind) {
        PersistedDestinationKind.INBOX -> Destination.List
        PersistedDestinationKind.COMPOSE -> Destination.Compose(
            preferredAgentId = agentId,
            returnTo = returnDestination(),
        )
        PersistedDestinationKind.CATCH_UP -> {
            val conversations = conversationIds.mapNotNull { id -> conversation(id) }
            if (conversations.isEmpty()) Destination.List else Destination.CatchUp(conversations)
        }
        PersistedDestinationKind.POD -> listState.pods.find { it.sId == spaceId }
            ?.let { Destination.Pod(it) }
            ?: Destination.List
        PersistedDestinationKind.POD_COMPOSE -> listState.pods.find { it.sId == spaceId }
            ?.let { Destination.PodCompose(it) }
            ?: Destination.List
        PersistedDestinationKind.CONVERSATION -> conversation(conversationId)
            ?.let { Destination.ConversationDetail(it, returnDestination()) }
            ?: Destination.List
        PersistedDestinationKind.CONVERSATION_FILES -> conversation(conversationId)
            ?.let { Destination.ConversationFiles(it, returnDestination()) }
            ?: Destination.List
        PersistedDestinationKind.ATTACHMENT -> {
            val restoredFileId = fileId
            val restoredTitle = title
            val restoredContentType = contentType
            if (restoredFileId == null || restoredTitle == null || restoredContentType == null) {
                returnDestination()
            } else {
                Destination.AttachmentViewer(
                    title = restoredTitle,
                    contentType = restoredContentType,
                    fileId = restoredFileId,
                    sourceUrl = sourceUrl,
                    returnTo = returnDestination(),
                )
            }
        }
    }
}
