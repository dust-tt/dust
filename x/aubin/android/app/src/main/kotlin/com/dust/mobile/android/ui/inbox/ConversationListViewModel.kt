package com.dust.mobile.android.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewConversationListData
import com.dust.mobile.android.ui.preview.localPreviewDustUser
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.model.loadConversationListData
import com.dust.mobile.core.model.sortAgentsForPicker
import com.dust.mobile.core.model.withUpdatedTitle
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
    private var sessionUser: User? = null
    private val activeUser: User
        get() = checkNotNull(sessionUser) { "Authenticated user is required" }

    fun load(user: User? = null) {
        sessionUser = user
        if (isLocalPreview) {
            val dustUser = localPreviewDustUser()
            viewModelScope.launch {
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
                persistWorkspace(workspace.sId)
            }
            return
        }
        viewModelScope.launch {
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
                prefetchAgents(workspace.sId)
                refresh()
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
        viewModelScope.launch {
            if (showProgress) {
                _state.update(ConversationListState::refreshStarted)
            }
            runCatching {
                loadConversationListData(
                    fetchConversations = {
                        graph.conversationRepository.fetchConversations(workspaceId, tokenProvider).conversations
                    },
                    fetchPods = {
                        graph.spaceRepository.fetchPods(workspaceId, tokenProvider)
                    },
                )
            }.onSuccess { data ->
                _state.update { it.withRefreshDataForWorkspace(workspaceId, data) }
                graph.offlineCacheRepository.cacheWorkspace(
                    activeUser = activeUser,
                    workspaceId = workspaceId,
                    conversations = data.conversations,
                    pods = data.pods,
                )
                syncWidget(workspaceId)
                runCatching {
                    graph.appSearchIndexer.indexWorkspaceContent(
                        workspaceId = workspaceId,
                        conversations = data.conversations,
                        pods = data.pods,
                        displayedBySystem = _state.value.systemSearchEnabled,
                    )
                }
            }.onFailure { error ->
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
        persistWorkspace(workspace.sId)
        prefetchAgents(workspace.sId)
        viewModelScope.launch {
            val cached = graph.offlineCacheRepository.cachedWorkspace(activeUser.id, workspace.sId)
            val cachedData = cached?.let {
                ConversationListData(conversations = it.conversations, pods = it.pods)
            }
            _state.update { it.withWorkspaceSelection(workspace, cachedData) }
            refresh()
        }
    }

    fun updateSearch(text: String) {
        _state.update { it.copy(searchText = text) }
    }

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

    fun toggleReadStatus(conversation: Conversation) {
        val workspaceId = _state.value.workspace?.sId ?: return
        val wasUnread = conversation.unread || conversation.actionRequired
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map {
                    if (it.sId == conversation.sId) {
                        it.copy(unread = !wasUnread, actionRequired = false)
                    } else {
                        it
                    }
                },
            )
        }
        syncWidget(workspaceId)
        viewModelScope.launch {
            if (isLocalPreview) return@launch
            runCatching {
                if (wasUnread) {
                    graph.conversationRepository.markAsRead(workspaceId, conversation.sId, tokenProvider)
                } else {
                    graph.conversationRepository.markAsUnread(workspaceId, conversation.sId, tokenProvider)
                }
            }.onSuccess {
                cacheCurrentWorkspace(workspaceId)
            }.onFailure {
                _state.update { state ->
                    state.copy(
                        conversations = state.conversations.map {
                            if (it.sId == conversation.sId) conversation else it
                        },
                    )
                }
                syncWidget(workspaceId)
            }
        }
    }

    fun deleteConversation(conversation: Conversation) {
        val workspaceId = _state.value.workspace?.sId ?: return
        val snapshot = _state.value.conversations
        _state.update { it.copy(conversations = it.conversations.filterNot { item -> item.sId == conversation.sId }) }
        syncWidget(workspaceId)
        viewModelScope.launch {
            if (isLocalPreview) return@launch
            runCatching {
                graph.conversationRepository.deleteConversation(workspaceId, conversation.sId, tokenProvider)
            }.onSuccess {
                graph.offlineCacheRepository.removeConversation(
                    activeUser,
                    workspaceId,
                    conversation.sId,
                )
                cacheCurrentWorkspace(workspaceId)
            }.onFailure {
                _state.update { state -> state.copy(conversations = snapshot) }
                syncWidget(workspaceId)
            }
        }
    }

    fun markConversationsAsRead(conversationIds: Set<String>) {
        if (conversationIds.isEmpty()) return
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map { conversation ->
                    if (conversation.sId in conversationIds) {
                        conversation.copy(unread = false, actionRequired = false)
                    } else {
                        conversation
                    }
                },
            )
        }
        _state.value.workspace?.sId?.let { workspaceId ->
            syncWidget(workspaceId)
            cacheCurrentWorkspace(workspaceId)
        }
    }

    fun updateConversationTitle(conversationId: String, title: String) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.withUpdatedTitle(conversationId, title),
            )
        }
        _state.value.workspace?.sId?.let { workspaceId ->
            syncWidget(workspaceId)
            cacheCurrentWorkspace(workspaceId)
        }
    }

    private fun syncWidget(workspaceId: String) {
        if (isLocalPreview) return
        val state = _state.value
        val workspace = state.workspace?.takeIf { it.sId == workspaceId } ?: return
        graph.catchUpWidgetController.updateFromConversations(workspace, state.conversations)
    }

    private fun persistWorkspace(workspaceId: String) {
        viewModelScope.launch {
            graph.persistedStateStore.update { it.copy(selectedWorkspaceId = workspaceId) }
        }
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
        persistWorkspace(workspace.sId)
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

    private fun prefetchAgents(workspaceId: String) {
        if (isLocalPreview) return
        viewModelScope.launch {
            runCatching {
                graph.agentRepository.fetchAgents(workspaceId, tokenProvider)
                    .let(::sortAgentsForPicker)
            }.onSuccess { agents ->
                runCatching { graph.agentShortcutPublisher.publish(workspaceId, agents) }
                runCatching {
                    graph.appSearchIndexer.indexAgents(
                        workspaceId = workspaceId,
                        agents = agents,
                        displayedBySystem = graph.persistedStateStore.current().systemSearchEnabled,
                    )
                }
            }
        }
    }
}
