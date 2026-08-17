package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.LoadingScreen
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.Space

@Composable
internal fun PodScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    space: Space,
    onSelectConversation: (Conversation) -> Unit,
    onNewConversation: () -> Unit,
    onOpenFile: (PodFileEntry) -> Unit,
    onOpenAdvancedSettings: () -> Unit,
    notificationsAvailable: Boolean,
    notificationsEnabled: Boolean,
    onManageNotifications: () -> Unit,
) {
    val viewModel: PodViewModel = viewModel(
        key = "pod-${space.sId}",
        factory = factory { PodViewModel(graph, tokenProvider, isLocalPreview, workspaceId, space) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(space.sId) {
        viewModel.loadIfNeeded()
    }
    LaunchedEffect(state.actionError) {
        state.actionError?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearActionError()
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .imePadding(),
    ) {
        Column(Modifier.fillMaxSize()) {
            PodTabBar(
                selectedTab = state.selectedTab,
                onSelectTab = { tab ->
                    focusManager.clearFocus(force = true)
                    keyboardController?.hide()
                    viewModel.selectTab(tab)
                },
            )
            when {
                state.isDetailsLoading && state.details == null -> LoadingScreen()
                state.detailsError != null && state.details == null -> ErrorScreen(
                    message = state.detailsError.orEmpty(),
                    onRetry = viewModel::load,
                )
                else -> when (state.selectedTab) {
                    PodTab.CONVERSATIONS -> PodConversationsTab(
                        graph = graph,
                        tokenProvider = tokenProvider,
                        workspaceId = workspaceId,
                        space = space,
                        state = state,
                        onSearch = viewModel::updateConversationSearch,
                        onSelectConversation = onSelectConversation,
                        onNewConversation = onNewConversation,
                        onOpenFrame = state.pinnedFrame?.let { frame -> { onOpenFile(frame) } },
                        onRetry = viewModel::refresh,
                        onRetryFrame = viewModel::retryPinnedFrame,
                    )
                    PodTab.TASKS -> PodTasksTab(
                        state = state,
                        canAddTasks = state.details?.isMember == true && state.details?.archivedAt == null,
                        onFilterChange = viewModel::setTaskFilter,
                        onToggleTask = viewModel::toggleTask,
                        onTaskDraftChange = viewModel::updateTaskDraft,
                        onCreateTask = viewModel::createTask,
                        onOpenConversation = { conversationId ->
                            state.conversations.find { it.sId == conversationId }?.let(onSelectConversation)
                        },
                        onRetry = viewModel::refresh,
                    )
                    PodTab.FILES -> PodFilesTab(
                        podId = space.sId,
                        state = state,
                        onOpenFolder = viewModel::openFolder,
                        onOpenParentFolder = viewModel::openParentFolder,
                        onOpenFile = onOpenFile,
                        onTogglePinnedFrame = { file ->
                            viewModel.updatePinnedFrame(
                                file.takeUnless { state.details?.pinnedFramePath == file.path },
                            )
                        },
                        onRetry = viewModel::refresh,
                    )
                    PodTab.SETTINGS -> PodSettingsTab(
                        state = state,
                        onUpdateNotification = viewModel::updateNotificationPreference,
                        onUpdateTaskSuggestions = viewModel::updateTaskSuggestions,
                        onOpenAdvancedSettings = onOpenAdvancedSettings,
                        notificationsAvailable = notificationsAvailable,
                        notificationsEnabled = notificationsEnabled,
                        onManageNotifications = onManageNotifications,
                        onRetry = viewModel::refresh,
                    )
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 16.dp, vertical = 72.dp),
        )
    }
}
