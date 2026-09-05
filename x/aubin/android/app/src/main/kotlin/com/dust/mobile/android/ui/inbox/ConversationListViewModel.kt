package com.dust.mobile.android.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewConversationListData
import com.dust.mobile.android.ui.preview.localPreviewDustUser
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.filteredByTitleSearch
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.model.loadConversationListData
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val SAVED_CONVERSATIONS_NOTICE = "Could not refresh. Showing saved conversations."

class ConversationListViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationListState())
    val state: StateFlow<ConversationListState> = _state.asStateFlow()
    private val platform = ConversationListPlatformController(graph, _state, viewModelScope, isLocalPreview, tokenProvider)
    private val discovery = ConversationDiscoveryController(
        state = _state,
        scope = viewModelScope,
        fetchPage = { workspaceId, cursor ->
            graph.conversationRepository.fetchConversations(workspaceId, tokenProvider, lastValue = cursor)
        },
        searchConversations = { workspaceId, query, cursor ->
            if (isLocalPreview) {
                ConversationsResponse(
                    localPreviewConversationListData(workspaceId).conversations.filteredByTitleSearch(query),
                    hasMore = false,
                )
            } else {
                graph.conversationRepository.searchConversations(workspaceId, query, tokenProvider, cursor)
            }
        },
    )
    private val actions = ConversationListActionsController(
        state = _state,
        scope = viewModelScope,
        setReadStatus = { workspaceId, conversationId, read ->
            if (!isLocalPreview) {
                if (read) graph.conversationRepository.markAsRead(workspaceId, conversationId, tokenProvider)
                else graph.conversationRepository.markAsUnread(workspaceId, conversationId, tokenProvider)
            }
        },
        delete = { workspaceId, conversationId ->
            if (!isLocalPreview) graph.conversationRepository.deleteConversation(workspaceId, conversationId, tokenProvider)
        },
        onChanged = { workspaceId ->
            platform.syncWidget(workspaceId)
            cacheCurrentWorkspace(workspaceId)
        },
        onDeleted = { workspaceId, conversationId ->
            if (!isLocalPreview) viewModelScope.launch {
                graph.offlineCacheRepository.removeConversation(activeUser, workspaceId, conversationId)
            }
        },
    )
    private var sessionUser: User? = null
    private var workspaceSelectionJob: Job? = null
    private var refreshJob: Job? = null
    private var initialLoadJob: Job? = null
    private val activeUser: User
        get() = checkNotNull(sessionUser) { "Authenticated user is required" }

    fun load(user: User? = sessionUser) {
        if (initialLoadJob?.isActive == true) return
        if (_state.value.dustUser != null) {
            if (_state.value.error != null) refresh()
            return
        }
        sessionUser = user
        if (isLocalPreview) {
            val dustUser = localPreviewDustUser()
            initialLoadJob = viewModelScope.launch {
                val persistedState = graph.persistedStateStore.current()
                val selectedWorkspaceId = persistedState.selectedWorkspaceId
                val workspace = dustUser.workspaces.find { it.sId == selectedWorkspaceId }
                    ?: dustUser.workspaces.first()
                val data = localPreviewConversationListData(workspace.sId)
                _state.value = ConversationListState(
                    isLoading = false,
                    dustUser = dustUser,
                    workspace = workspace,
                    workspaces = dustUser.workspaces,
                    conversations = data.conversations,
                    pods = data.pods,
                    systemSearchEnabled = false,
                )
                platform.persistWorkspace(workspace.sId)
            }
            return
        }
        initialLoadJob = viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val persistedState = graph.persistedStateStore.current()
            graph.offlineCacheRepository.cachedDustUser(activeUser.id)?.let { cachedUser ->
                showWorkspace(
                    dustUser = cachedUser,
                    selectedWorkspaceId = persistedState.selectedWorkspaceId,
                    systemSearchEnabled = persistedState.systemSearchEnabled,
                )
            }
            try {
                val dustUser = graph.userRepository.fetchDustUser(tokenProvider)
                graph.offlineCacheRepository.cacheDustUser(activeUser, dustUser)
                val workspace = showWorkspace(
                    dustUser = dustUser,
                    selectedWorkspaceId = persistedState.selectedWorkspaceId,
                    systemSearchEnabled = persistedState.systemSearchEnabled,
                ) ?: error("No workspace found")
                platform.prefetchAgents(workspace.sId)
                refresh()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update { state ->
                    state.copy(
                        isLoading = false,
                        error = if (state.conversations.isNotEmpty() || state.pods.isNotEmpty()) {
                            SAVED_CONVERSATIONS_NOTICE
                        } else {
                            error.message ?: "Failed to load conversations"
                        },
                    )
                }
            }
        }
    }

    fun refresh() = refresh(showError = true, showProgress = true)

    fun refreshSilently() = refresh(showError = false, showProgress = false)

    private fun refresh(showError: Boolean, showProgress: Boolean) {
        val workspaceId = _state.value.workspace?.sId ?: return
        if (isLocalPreview) {
            _state.update { it.withRefreshDataForWorkspace(workspaceId, localPreviewConversationListData(workspaceId)) }
            return
        }
        if (!showProgress && refreshJob?.isActive == true) return
        refreshJob?.cancel()
        refreshJob = viewModelScope.launch {
            if (showProgress) {
                _state.update(ConversationListState::refreshStarted)
            }
            runCatching {
                loadConversationListData(
                    fetchConversations = {
                        graph.conversationRepository.fetchConversations(workspaceId, tokenProvider)
                    },
                    fetchPods = {
                        graph.spaceRepository.fetchPods(workspaceId, tokenProvider)
                    },
                )
            }.onSuccess { data ->
                currentCoroutineContext().ensureActive()
                _state.update { it.withRefreshDataForWorkspace(workspaceId, data) }
                graph.offlineCacheRepository.cacheWorkspace(
                    activeUser = activeUser,
                    workspaceId = workspaceId,
                    conversations = data.conversations,
                    pods = data.pods,
                )
                platform.syncWidget(workspaceId)
                runCatching {
                    graph.appSearchIndexer.indexWorkspaceContent(
                        workspaceId = workspaceId,
                        conversations = data.conversations,
                        pods = data.pods,
                        displayedBySystem = _state.value.systemSearchEnabled,
                    )
                }
            }.onFailure { error ->
                currentCoroutineContext().ensureActive()
                if (showError) {
                    _state.update {
                        it.withRefreshErrorForWorkspace(
                            workspaceId = workspaceId,
                            error = if (it.conversations.isNotEmpty() || it.pods.isNotEmpty()) {
                                SAVED_CONVERSATIONS_NOTICE
                            } else {
                                error.message ?: "Refresh failed"
                            },
                        )
                    }
                } else {
                    _state.update { it.withRefreshStoppedForWorkspace(workspaceId) }
                }
            }
        }
    }

    fun switchWorkspace(workspace: Workspace) {
        discovery.cancel()
        workspaceSelectionJob?.cancel()
        refreshJob?.cancel()
        _state.update { it.withWorkspaceSelection(workspace, null) }
        platform.persistWorkspace(workspace.sId)
        platform.prefetchAgents(workspace.sId)
        if (isLocalPreview) {
            refresh()
            return
        }
        workspaceSelectionJob = viewModelScope.launch {
            val cached = graph.offlineCacheRepository.cachedWorkspace(activeUser.id, workspace.sId)
            if (cached != null) {
                val data = ConversationListData(conversations = cached.conversations, pods = cached.pods)
                _state.update { it.withRefreshDataForWorkspace(workspace.sId, data) }
            }
            currentCoroutineContext().ensureActive()
            refresh()
        }
    }

    fun updateSearch(text: String) = discovery.updateSearch(text)

    fun loadMore() = discovery.loadMore()

    fun retrySearch() = discovery.retrySearch()

    fun setSystemSearchEnabled(enabled: Boolean) {
        if (!graph.appSearchIndexer.supportsSystemSurfaces) return
        _state.update { it.copy(systemSearchEnabled = enabled) }
        viewModelScope.launch {
            graph.persistedStateStore.update { it.copy(systemSearchEnabled = enabled) }
            runCatching { graph.appSearchIndexer.updateSystemVisibility(enabled) }
        }
    }

    fun togglePodsExpanded() {
        _state.update { it.copy(isPodsExpanded = !it.isPodsExpanded) }
    }

    fun toggleReadStatus(conversation: Conversation) = actions.toggleReadStatus(conversation)

    fun deleteConversation(conversation: Conversation) = actions.deleteConversation(conversation)

    fun markConversationsAsRead(conversationIds: Set<String>) = actions.markConversationsAsRead(conversationIds)

    fun updateConversationTitle(conversationId: String, title: String) = actions.updateTitle(conversationId, title)

    fun dismissActionError() {
        _state.update { it.copy(actionError = null) }
    }

    private suspend fun showWorkspace(
        dustUser: DustUser,
        selectedWorkspaceId: String?,
        systemSearchEnabled: Boolean,
    ): Workspace? {
        val targetWorkspaceId = selectedWorkspaceId
            ?.takeIf { id -> dustUser.workspaces.any { it.sId == id } }
            ?: dustUser.selectedWorkspace
            ?: dustUser.workspaces.firstOrNull()?.sId
        val workspace = dustUser.workspaces.firstOrNull { it.sId == targetWorkspaceId } ?: return null
        val cached = graph.offlineCacheRepository.cachedWorkspace(activeUser.id, workspace.sId)
        val cachedData = cached?.let {
            ConversationListData(conversations = it.conversations, pods = it.pods)
        }
        _state.update {
            it.withWorkspaceData(dustUser, workspace, cachedData, systemSearchEnabled)
        }
        platform.persistWorkspace(workspace.sId)
        return workspace
    }

    private fun cacheCurrentWorkspace(workspaceId: String) {
        if (isLocalPreview) return
        viewModelScope.launch {
            val state = _state.value
            if (state.workspace?.sId != workspaceId) return@launch
            graph.offlineCacheRepository.cacheWorkspace(
                activeUser = activeUser,
                workspaceId = workspaceId,
                conversations = state.conversations,
                pods = state.pods,
            )
        }
    }

}
