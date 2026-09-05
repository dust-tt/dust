package com.dust.mobile.android.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.notifications.NotificationPresentationState
import com.dust.mobile.android.notifications.NotificationRenderer
import com.dust.mobile.android.notifications.rememberNotificationPermissionController
import com.dust.mobile.android.share.IncomingShare
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.LoadingScreen
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.inbox.ConversationListViewModel
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.DeepLinkTarget
import com.dust.mobile.core.model.User
import kotlinx.coroutines.flow.Flow

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AuthenticatedApp(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    pendingDeepLink: DeepLinkTarget?,
    onDeepLinkHandled: () -> Unit,
    pendingShare: IncomingShare?,
    keyboardCommands: Flow<AppKeyboardCommand>,
    onShareHandled: () -> Unit,
    openUrl: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val listViewModel: ConversationListViewModel = viewModel(
        key = "conversation-list",
        factory = factory { ConversationListViewModel(graph, tokenProvider, isLocalPreview) },
    )
    val listState by listViewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val isImeVisible = WindowInsets.isImeVisible
    var destination by remember { mutableStateOf<Destination>(Destination.List) }
    var navigationInitialized by remember { mutableStateOf(false) }
    var searchFocusRequestId by remember { mutableIntStateOf(0) }
    val currentListState by rememberUpdatedState(listState)
    val notificationPermission = rememberNotificationPermissionController(
        isAvailable = false,
    )
    val backDestination = destination.backDestinationOrNull()
    val dismissesImeBeforeBack = isImeVisible && destination.dismissesImeBeforeBackNavigation
    val navigateTo: (Destination) -> Unit = { target ->
        val opensComposer = target is Destination.Compose || target is Destination.PodCompose
        if (!opensComposer) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
        destination = target
    }

    LaunchedEffect(keyboardCommands) {
        keyboardCommands.collect { command ->
            when (command) {
                AppKeyboardCommand.NEW_CONVERSATION -> navigateTo(Destination.Compose())
                AppKeyboardCommand.SEARCH_CONVERSATIONS -> {
                    navigateTo(Destination.List)
                    searchFocusRequestId += 1
                }
                AppKeyboardCommand.CATCH_UP -> {
                    val unread = currentListState.unreadConversations
                    if (unread.isNotEmpty()) navigateTo(Destination.CatchUp(unread))
                }
            }
        }
    }

    BackHandler(enabled = backDestination != null || dismissesImeBeforeBack) {
        if (dismissesImeBeforeBack) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        } else {
            backDestination?.let(navigateTo)
        }
    }

    LaunchedEffect(Unit) {
        listViewModel.load(user)
    }
    LaunchedEffect(
        navigationInitialized,
        pendingDeepLink,
        pendingShare?.id,
        listState.workspace?.sId,
        listState.isLoading,
    ) {
        if (navigationInitialized) return@LaunchedEffect
        if (pendingDeepLink != null || pendingShare != null) {
            navigationInitialized = true
            return@LaunchedEffect
        }
        val workspace = listState.workspace ?: return@LaunchedEffect
        if (listState.isLoading) return@LaunchedEffect
        destination = graph.persistedStateStore.current().destination.restoreDestination(
            graph = graph,
            tokenProvider = tokenProvider,
            isLocalPreview = isLocalPreview,
            workspaceId = workspace.sId,
            listState = listState,
        )
        navigationInitialized = true
    }
    LaunchedEffect(destination, navigationInitialized) {
        if (navigationInitialized) {
            graph.persistedStateStore.update { state ->
                state.copy(destination = destination.toPersistedDestination())
            }
        }
    }
    LaunchedEffect(
        pendingDeepLink,
        listState.workspace?.sId,
        listState.workspaces,
        listState.conversations,
        listState.pods,
        listState.isLoading,
    ) {
        val target = pendingDeepLink ?: return@LaunchedEffect
        val targetWorkspaceId = target.workspaceIdOrNull
        if (targetWorkspaceId == null) {
            if (listState.workspace == null || listState.isLoading) return@LaunchedEffect
            target.appActionDestination(listState)?.let(navigateTo)
            onDeepLinkHandled()
            return@LaunchedEffect
        }

        if (listState.workspace?.sId != targetWorkspaceId) {
            if (listState.workspaces.isEmpty()) return@LaunchedEffect
            val targetWorkspace = listState.workspaces.find { it.sId == targetWorkspaceId }
            if (targetWorkspace == null) {
                onDeepLinkHandled()
            } else {
                listViewModel.switchWorkspace(targetWorkspace)
            }
            return@LaunchedEffect
        }
        if (listState.isLoading) return@LaunchedEffect

        when (target) {
            is DeepLinkTarget.NewConversation -> {
                target.appActionDestination(listState)?.let(navigateTo)
                onDeepLinkHandled()
            }
            is DeepLinkTarget.Conversation -> {
                val conversation = listState.conversations.find { it.sId == target.conversationId }
                    ?: if (isLocalPreview) {
                        null
                    } else {
                        runCatching {
                            graph.conversationRepository.fetchConversation(
                                workspaceId = target.workspaceId,
                                conversationId = target.conversationId,
                                tokenProvider = tokenProvider,
                            )
                        }.getOrNull()
                    }
                if (conversation != null) {
                    navigateTo(Destination.ConversationDetail(conversation, returnTo = Destination.List))
                }
                onDeepLinkHandled()
            }
            is DeepLinkTarget.Pod -> {
                listState.pods.find { it.sId == target.podId }?.let { pod ->
                    navigateTo(Destination.Pod(pod))
                }
                onDeepLinkHandled()
            }
            else -> Unit
        }
    }
    LaunchedEffect(pendingShare, listState.workspace?.sId, listState.workspaces, listState.isLoading) {
        val share = pendingShare ?: return@LaunchedEffect
        val workspace = listState.workspace ?: return@LaunchedEffect
        val targetWorkspaceId = share.targetWorkspaceId
        if (targetWorkspaceId != null && workspace.sId != targetWorkspaceId) {
            listState.workspaces.find { it.sId == targetWorkspaceId }?.let { targetWorkspace ->
                listViewModel.switchWorkspace(targetWorkspace)
                return@LaunchedEffect
            }
        }
        if (!listState.isLoading) navigateTo(Destination.Compose())
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                listViewModel.refreshSilently()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    LaunchedEffect(destination) {
        val conversationId = (destination as? Destination.ConversationDetail)?.conversation?.sId
        NotificationPresentationState.showConversation(conversationId)
        conversationId?.let { NotificationRenderer(graph.appContext).cancelConversation(it) }
    }
    DisposableEffect(Unit) {
        onDispose { NotificationPresentationState.showConversation(null) }
    }

    val workspace = listState.workspace
    when {
        workspace == null && listState.isLoading -> LoadingScreen()
        workspace == null -> ErrorScreen(
            message = listState.error ?: "No workspace found",
            onRetry = listViewModel::load,
        )
        else -> AuthenticatedAppScaffold(
            destination = destination,
            graph = graph,
            tokenProvider = tokenProvider,
            workspace = workspace,
            isLocalPreview = isLocalPreview,
            openUrl = openUrl,
            navigateTo = navigateTo,
        ) { paneDestination ->
            AuthenticatedDestinationContent(
                destination = paneDestination,
                graph = graph,
                user = user,
                tokenProvider = tokenProvider,
                isLocalPreview = isLocalPreview,
                workspace = workspace,
                listState = listState,
                listViewModel = listViewModel,
                notificationPermission = notificationPermission,
                pendingShare = pendingShare,
                searchFocusRequestId = searchFocusRequestId,
                onShareHandled = onShareHandled,
                openUrl = openUrl,
                onLogout = onLogout,
                navigateTo = navigateTo,
            )
        }
    }
}
