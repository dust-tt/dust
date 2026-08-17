package com.dust.mobile.android.ui.navigation

import androidx.compose.runtime.Composable
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.model.Workspace

@Composable
internal fun AuthenticatedDestinationTopBar(
    destination: Destination,
    graph: AppGraph,
    workspace: Workspace,
    isLocalPreview: Boolean,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
    onOpenConversationFiles: () -> Unit,
) {
    if (destination == Destination.List || destination is Destination.CatchUp) return
    val backDestination = destination.backDestinationOrNull() ?: return
    val currentDetail = destination as? Destination.ConversationDetail

    AuthenticatedTopBar(
        title = destination.label,
        onBack = { navigateTo(backDestination) },
        onOpenFiles = currentDetail?.let { onOpenConversationFiles },
        onOpenInBrowser = destination.browserAction(
            graph = graph,
            workspace = workspace,
            isLocalPreview = isLocalPreview,
            openUrl = openUrl,
        ),
    )
}

private fun Destination.browserAction(
    graph: AppGraph,
    workspace: Workspace,
    isLocalPreview: Boolean,
    openUrl: (String) -> Unit,
): (() -> Unit)? {
    if (isLocalPreview) return null
    val url = when (this) {
        is Destination.ConversationDetail -> graph.config.conversationUrl(workspace.sId, conversation.sId)
        is Destination.Pod -> graph.config.podUrl(workspace.sId, space.sId)
        is Destination.AttachmentViewer -> sourceUrl ?: returnTo.browserFallbackUrl(graph, workspace)
        is Destination.Compose,
        Destination.List,
        is Destination.CatchUp,
        is Destination.PodCompose,
        is Destination.ConversationFiles,
        -> null
    }
    return url?.let { { openUrl(it) } }
}

private fun Destination.browserFallbackUrl(graph: AppGraph, workspace: Workspace): String? =
    when (this) {
        is Destination.Pod -> graph.config.podUrl(workspace.sId, space.sId)
        is Destination.ConversationDetail -> graph.config.conversationUrl(workspace.sId, conversation.sId)
        is Destination.ConversationFiles -> graph.config.conversationUrl(workspace.sId, conversation.sId)
        is Destination.AttachmentViewer -> sourceUrl ?: returnTo.browserFallbackUrl(graph, workspace)
        is Destination.Compose,
        Destination.List,
        is Destination.CatchUp,
        is Destination.PodCompose,
        -> null
    }
