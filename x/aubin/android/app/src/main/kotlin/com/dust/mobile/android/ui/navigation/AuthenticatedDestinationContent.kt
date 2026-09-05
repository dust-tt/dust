package com.dust.mobile.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.notifications.NotificationPermissionController
import com.dust.mobile.android.share.IncomingShare
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.composer.ComposeScreen
import com.dust.mobile.android.ui.conversation.detail.ConversationDetailScreen
import com.dust.mobile.android.ui.conversation.files.AttachmentViewerScreen
import com.dust.mobile.android.ui.conversation.files.ConversationFilesScreen
import com.dust.mobile.android.ui.inbox.ConversationListScreen
import com.dust.mobile.android.ui.inbox.ConversationListState
import com.dust.mobile.android.ui.inbox.ConversationListViewModel
import com.dust.mobile.android.ui.inbox.pod.PodScreen
import com.dust.mobile.android.ui.inbox.pod.PodViewModel
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace

@Composable
internal fun AuthenticatedDestinationContent(
    destination: Destination,
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspace: Workspace,
    listState: ConversationListState,
    listViewModel: ConversationListViewModel,
    notificationPermission: NotificationPermissionController,
    pendingShare: IncomingShare?,
    searchFocusRequestId: Int,
    onShareHandled: () -> Unit,
    openUrl: (String) -> Unit,
    onLogout: () -> Unit,
    navigateTo: (Destination) -> Unit,
) {
    when (destination) {
        is Destination.Compose -> ComposeScreen(
            graph = graph,
            user = user,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspaceId = workspace.sId,
            preferredAgentId = destination.preferredAgentId,
            incomingShare = pendingShare,
            onShareHandled = onShareHandled,
            onCreated = { conversation ->
                listViewModel.refresh()
                navigateTo(Destination.ConversationDetail(conversation, returnTo = destination.returnTo))
            },
        )
        Destination.List -> ConversationListScreen(
            state = listState,
            searchFocusRequestId = searchFocusRequestId,
            user = user,
            isLocalPreview = isLocalPreview,
            onSearch = listViewModel::updateSearch,
            onSwitchWorkspace = listViewModel::switchWorkspace,
            onLogout = onLogout,
            notificationsAvailable = notificationPermission.isAvailable,
            notificationsEnabled = notificationPermission.areNotificationsEnabled,
            onManageNotifications = notificationPermission.manage,
            systemSearchAvailable = graph.appSearchIndexer.supportsSystemSurfaces,
            onSystemSearchChange = listViewModel::setSystemSearchEnabled,
            onNewConversation = { navigateTo(Destination.Compose()) },
            onSelectPod = { navigateTo(Destination.Pod(it)) },
            onTogglePodsExpanded = listViewModel::togglePodsExpanded,
            onSelectConversation = {
                navigateTo(Destination.ConversationDetail(it, returnTo = Destination.List))
            },
            onToggleRead = listViewModel::toggleReadStatus,
            onDelete = listViewModel::deleteConversation,
            onCatchUp = listState.unreadConversations.takeIf { it.isNotEmpty() }
                ?.let { unread -> { navigateTo(Destination.CatchUp(unread)) } },
            onRefresh = listViewModel::refresh,
            onLoadMore = listViewModel::loadMore,
            onRetrySearch = listViewModel::retrySearch,
            onDismissActionError = listViewModel::dismissActionError,
        )
        is Destination.CatchUp -> CatchUpDestinationContent(
            destination = destination,
            graph = graph,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspace = workspace,
            user = user,
            listViewModel = listViewModel,
            openUrl = openUrl,
            navigateTo = navigateTo,
        )
        is Destination.Pod -> PodScreen(
            graph = graph,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspaceId = workspace.sId,
            space = destination.space,
            onSelectConversation = {
                navigateTo(
                    Destination.ConversationDetail(
                        it,
                        returnTo = Destination.Pod(destination.space),
                    ),
                )
            },
            onNewConversation = { navigateTo(Destination.PodCompose(destination.space)) },
            onOpenFile = { file ->
                val fileId = file.fileId ?: return@PodScreen
                navigateTo(
                    Destination.AttachmentViewer(
                        title = file.fileName,
                        contentType = file.contentType.orEmpty(),
                        fileId = fileId,
                        sourceUrl = null,
                        returnTo = destination,
                    ),
                )
            },
            onOpenAdvancedSettings = {
                openUrl(graph.config.podUrl(workspace.sId, destination.space.sId))
            },
            notificationsAvailable = notificationPermission.isAvailable,
            notificationsEnabled = notificationPermission.areNotificationsEnabled,
            onManageNotifications = notificationPermission.manage,
        )
        is Destination.PodCompose -> {
            val podViewModel = viewModel<PodViewModel>(
                key = "pod-${destination.space.sId}",
                factory = factory {
                    PodViewModel(
                        graph,
                        tokenProvider,
                        isLocalPreview,
                        workspace.sId,
                        destination.space,
                    )
                },
            )
            ComposeScreen(
                graph = graph,
                user = user,
                tokenProvider = tokenProvider,
                isLocalPreview = isLocalPreview,
                workspaceId = workspace.sId,
                spaceId = destination.space.sId,
                onCreated = { conversation ->
                    listViewModel.refresh()
                    podViewModel.refresh()
                    navigateTo(
                        Destination.ConversationDetail(
                            conversation,
                            returnTo = Destination.Pod(destination.space),
                        ),
                    )
                },
            )
        }
        is Destination.ConversationDetail -> ConversationDestination(
            destination = destination,
            graph = graph,
            user = user,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspace = workspace,
            currentUserSId = listState.dustUser?.sId,
            listViewModel = listViewModel,
            openUrl = openUrl,
            navigateTo = navigateTo,
        )
        is Destination.ConversationFiles -> ConversationFilesScreen(
            graph = graph,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspaceId = workspace.sId,
            conversation = destination.conversation,
            onOpenAttachment = { attachment ->
                val fileId = attachment.fileId ?: return@ConversationFilesScreen
                navigateTo(
                    Destination.AttachmentViewer(
                        title = attachment.title,
                        contentType = attachment.contentType,
                        fileId = fileId,
                        sourceUrl = attachment.sourceUrl,
                        returnTo = destination,
                    ),
                )
            },
        )
        is Destination.AttachmentViewer -> AttachmentViewerScreen(
            graph = graph,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspaceId = workspace.sId,
            title = destination.title,
            contentType = destination.contentType,
            fileId = destination.fileId,
            sourceUrl = destination.sourceUrl,
        )
    }
}

@Composable
private fun ConversationDestination(
    destination: Destination.ConversationDetail,
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspace: Workspace,
    currentUserSId: String?,
    listViewModel: ConversationListViewModel,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
) {
    val podReturnViewModel = (destination.returnTo as? Destination.Pod)?.let { pod ->
        viewModel<PodViewModel>(
            key = "pod-${pod.space.sId}",
            factory = factory {
                PodViewModel(
                    graph,
                    tokenProvider,
                    isLocalPreview,
                    workspace.sId,
                    pod.space,
                )
            },
        )
    }
    ConversationDetailScreen(
        graph = graph,
        user = user,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspace.sId,
        conversation = destination.conversation,
        currentUserSId = currentUserSId,
        onOpenInBrowser = if (isLocalPreview) null else {
            { openUrl(graph.config.conversationUrl(workspace.sId, destination.conversation.sId)) }
        },
        onTitleChanged = { title ->
            listViewModel.updateConversationTitle(destination.conversation.sId, title)
            podReturnViewModel?.updateConversationTitle(destination.conversation.sId, title)
        },
        onMarkedAsRead = {
            listViewModel.markConversationsAsRead(setOf(destination.conversation.sId))
            podReturnViewModel?.markConversationAsRead(destination.conversation.sId)
        },
        onNewConversation = { preferredAgentId ->
            navigateTo(
                Destination.Compose(
                    preferredAgentId = preferredAgentId,
                    returnTo = destination,
                ),
            )
        },
        onOpenContentFragment = { fragment ->
            val fileId = fragment.fileId ?: return@ConversationDetailScreen
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
            val fileId = file.fileId ?: return@ConversationDetailScreen
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
    )
}
