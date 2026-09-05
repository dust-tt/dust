package com.dust.mobile.android.ui.navigation

import androidx.compose.runtime.Composable
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.inbox.CatchUpScreen
import com.dust.mobile.android.ui.inbox.ConversationListViewModel
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace

@Composable
internal fun CatchUpDestinationContent(
    destination: Destination.CatchUp,
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspace: Workspace,
    user: User,
    listViewModel: ConversationListViewModel,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
) {
    CatchUpScreen(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspace.sId,
        currentUserEmail = user.email,
        conversations = destination.conversations,
        sessionId = destination.sessionId,
        onDismiss = { markedIds ->
            listViewModel.markConversationsAsRead(markedIds)
            navigateTo(Destination.List)
        },
        onOpenConversation = { markedIds, conversation ->
            listViewModel.markConversationsAsRead(markedIds)
            navigateTo(Destination.ConversationDetail(conversation, returnTo = Destination.List))
        },
        onOpenContentFragment = { fragment ->
            val fileId = fragment.fileId ?: return@CatchUpScreen
            navigateTo(
                Destination.AttachmentViewer(
                    title = fragment.title,
                    contentType = fragment.contentType,
                    fileId = fileId,
                    sourceUrl = fragment.sourceUrl,
                    returnTo = destination,
                ),
            )
        },
        onOpenFile = { file ->
            val fileId = file.fileId ?: return@CatchUpScreen
            navigateTo(
                Destination.AttachmentViewer(
                    title = file.title,
                    contentType = file.contentType,
                    fileId = fileId,
                    sourceUrl = null,
                    returnTo = destination,
                ),
            )
        },
        onOpenCitation = { citation -> citation.href?.let(openUrl) },
    )
}
