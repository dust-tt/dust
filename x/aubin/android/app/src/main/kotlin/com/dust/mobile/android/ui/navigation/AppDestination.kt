package com.dust.mobile.android.ui.navigation

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space
import java.util.UUID

internal sealed interface Destination {
    data class Compose(
        val preferredAgentId: String? = null,
        val returnTo: Destination = List,
    ) : Destination
    data object List : Destination
    data class CatchUp(
        val conversations: kotlin.collections.List<Conversation>,
        val sessionId: String = UUID.randomUUID().toString(),
    ) : Destination
    data class Pod(val space: Space) : Destination
    data class PodCompose(val space: Space) : Destination
    data class ConversationDetail(val conversation: Conversation, val returnTo: Destination = List) : Destination
    data class ConversationFiles(val conversation: Conversation, val returnTo: Destination) : Destination
    data class AttachmentViewer(
        val title: String,
        val contentType: String,
        val fileId: String,
        val sourceUrl: String?,
        val returnTo: Destination,
    ) : Destination
}

internal fun Destination.backDestinationOrNull(): Destination? =
    when (this) {
        Destination.List -> null
        is Destination.Compose -> returnTo
        is Destination.CatchUp -> null
        is Destination.Pod -> Destination.List
        is Destination.PodCompose -> Destination.Pod(space)
        is Destination.ConversationDetail -> returnTo
        is Destination.ConversationFiles -> returnTo
        is Destination.AttachmentViewer -> returnTo
    }

internal val Destination.label: String
    get() = when (this) {
        is Destination.Compose -> "New conversation"
        Destination.List -> "Inbox"
        is Destination.CatchUp -> "Catch up"
        is Destination.Pod -> space.name
        is Destination.PodCompose -> "New in ${space.name}"
        is Destination.ConversationDetail -> conversation.title ?: "Conversation"
        is Destination.ConversationFiles -> "Conversation files"
        is Destination.AttachmentViewer -> title
    }

internal val Destination.usesInboxListDetailLayout: Boolean
    get() = when (this) {
        Destination.List -> true
        is Destination.ConversationDetail -> returnTo.returnsToInbox()
        is Destination.ConversationFiles -> returnTo.returnsToInbox()
        is Destination.AttachmentViewer -> returnTo.returnsToInbox()
        is Destination.Compose,
        is Destination.CatchUp,
        is Destination.Pod,
        is Destination.PodCompose,
        -> false
    }

internal val Destination.dismissesImeBeforeBackNavigation: Boolean
    get() = when (this) {
        is Destination.ConversationFiles,
        is Destination.AttachmentViewer,
        -> false
        is Destination.Compose,
        Destination.List,
        is Destination.CatchUp,
        is Destination.Pod,
        is Destination.PodCompose,
        is Destination.ConversationDetail,
        -> true
    }

private fun Destination.returnsToInbox(): Boolean =
    when (this) {
        Destination.List -> true
        is Destination.ConversationDetail -> returnTo.returnsToInbox()
        is Destination.ConversationFiles -> returnTo.returnsToInbox()
        is Destination.AttachmentViewer -> returnTo.returnsToInbox()
        is Destination.Compose,
        is Destination.CatchUp,
        is Destination.Pod,
        is Destination.PodCompose,
        -> false
    }
