package com.dust.mobile.android.ui.inbox.pod

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewPodConversations
import com.dust.mobile.android.ui.preview.localPreviewPodDetails
import com.dust.mobile.android.ui.preview.localPreviewPodFiles
import com.dust.mobile.android.ui.preview.localPreviewPodNotificationPreference
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.relativePath
import com.dust.mobile.core.model.withUpdatedTitle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class PodViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean,
    private val workspaceId: String,
    private val space: Space,
) : ViewModel() {
    private val _state = MutableStateFlow(PodState())
    val state: StateFlow<PodState> = _state.asStateFlow()

    private val taskController = PodTaskController(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspaceId,
        podId = space.sId,
        scope = viewModelScope,
        state = _state,
    )
    private val frameController = PodFrameController(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspaceId,
        podId = space.sId,
        scope = viewModelScope,
        state = _state,
    )

    fun loadIfNeeded() {
        if (_state.value.details == null) {
            load()
        }
    }

    fun load() {
        if (isLocalPreview) {
            _state.value = PodState(
                details = localPreviewPodDetails(space),
                isDetailsLoading = false,
                conversations = localPreviewPodConversations(workspaceId, space.sId),
                isConversationsLoading = false,
                files = localPreviewPodFiles(space.sId),
                isFilesLoading = false,
                notificationPreference = localPreviewPodNotificationPreference(space.sId),
                isNotificationLoading = false,
            )
            frameController.load()
            return
        }
        loadDetails()
        loadConversations()
        loadFiles()
        loadNotificationPreference()
    }

    fun refresh() {
        loadDetails()
        when (_state.value.selectedTab) {
            PodTab.CONVERSATIONS -> loadConversations()
            PodTab.TASKS -> taskController.load()
            PodTab.FILES -> loadFiles()
            PodTab.SETTINGS -> loadNotificationPreference()
        }
    }

    fun selectTab(tab: PodTab) {
        _state.update { it.copy(selectedTab = tab, actionError = null) }
        if (tab == PodTab.TASKS && !_state.value.hasLoadedTasks) {
            taskController.load()
        }
    }

    fun updateConversationSearch(text: String) {
        _state.update { it.copy(conversationSearch = text) }
    }

    fun updateConversationTitle(conversationId: String, title: String) {
        _state.update { it.copy(conversations = it.conversations.withUpdatedTitle(conversationId, title)) }
    }

    fun markConversationAsRead(conversationId: String) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map { conversation ->
                    if (conversation.sId == conversationId) {
                        conversation.copy(unread = false, actionRequired = false)
                    } else {
                        conversation
                    }
                },
            )
        }
    }

    fun openFolder(entry: PodFileEntry) {
        if (entry.isDirectory) {
            _state.update { it.copy(currentFolderPath = entry.relativePath(space.sId)) }
        }
    }

    fun openParentFolder() {
        _state.update { state ->
            state.copy(
                currentFolderPath = state.currentFolderPath.substringBeforeLast('/', missingDelimiterValue = ""),
            )
        }
    }

    fun setTaskFilter(filter: PodTaskFilter) = taskController.setFilter(filter)

    fun updateTaskDraft(text: String) {
        _state.update { it.copy(taskDraft = text) }
    }

    fun createTask() = taskController.create()

    fun toggleTask(task: PodTask) = taskController.toggle(task)

    fun updatePinnedFrame(file: PodFileEntry?) = frameController.update(file)

    fun retryPinnedFrame() = frameController.retry()

    fun updateNotificationPreference(preference: PodNotificationCondition) {
        if (_state.value.isNotificationSaving) return
        viewModelScope.launch {
            _state.update { it.copy(isNotificationSaving = true, actionError = null) }
            runCatching {
                if (!isLocalPreview) {
                    graph.podRepository.updateNotificationPreference(
                        workspaceId,
                        space.sId,
                        preference,
                        tokenProvider,
                    )
                }
            }.onSuccess {
                _state.update { state ->
                    state.copy(
                        isNotificationSaving = false,
                        notificationPreference = state.notificationPreference?.copy(preference = preference),
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(isNotificationSaving = false, actionError = error.message ?: "Failed to update notifications")
                }
            }
        }
    }

    fun updateTaskSuggestions(enabled: Boolean) {
        if (_state.value.isTaskSuggestionsSaving) return
        viewModelScope.launch {
            _state.update { it.copy(isTaskSuggestionsSaving = true, actionError = null) }
            runCatching {
                if (!isLocalPreview) {
                    graph.podRepository.updateTaskSuggestions(
                        workspaceId,
                        space.sId,
                        enabled,
                        tokenProvider,
                    )
                }
            }.onSuccess {
                _state.update { state ->
                    state.copy(
                        isTaskSuggestionsSaving = false,
                        details = state.details?.copy(todoGenerationEnabled = enabled),
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isTaskSuggestionsSaving = false,
                        actionError = error.message ?: "Failed to update task suggestions",
                    )
                }
            }
        }
    }

    fun clearActionError() {
        _state.update { it.copy(actionError = null) }
    }

    private fun loadDetails() {
        if (isLocalPreview) return
        viewModelScope.launch {
            _state.update { it.copy(isDetailsLoading = true, detailsError = null) }
            runCatching { graph.podRepository.fetchDetails(workspaceId, space.sId, tokenProvider) }
                .onSuccess { details ->
                    _state.update { it.copy(details = details, isDetailsLoading = false) }
                    frameController.load()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isDetailsLoading = false, detailsError = error.message ?: "Failed to load Pod")
                    }
                }
        }
    }

    private fun loadConversations() {
        if (isLocalPreview) return
        viewModelScope.launch {
            _state.update { it.copy(isConversationsLoading = true, conversationsError = null) }
            runCatching {
                graph.conversationRepository.fetchSpaceConversations(workspaceId, space.sId, tokenProvider)
                    .conversations.map { it.asConversation() }
            }.onSuccess { conversations ->
                _state.update { it.copy(isConversationsLoading = false, conversations = conversations) }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isConversationsLoading = false,
                        conversationsError = error.message ?: "Failed to load conversations",
                    )
                }
            }
        }
    }

    private fun loadFiles() {
        if (isLocalPreview) return
        viewModelScope.launch {
            _state.update { it.copy(isFilesLoading = true, filesError = null) }
            runCatching { graph.podRepository.fetchFiles(workspaceId, space.sId, tokenProvider) }
                .onSuccess { files ->
                    _state.update { it.copy(isFilesLoading = false, files = files) }
                    frameController.load()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isFilesLoading = false, filesError = error.message ?: "Failed to load Pod files")
                    }
                }
        }
    }

    private fun loadNotificationPreference() {
        if (isLocalPreview) return
        viewModelScope.launch {
            _state.update { it.copy(isNotificationLoading = true, notificationError = null) }
            runCatching {
                graph.podRepository.fetchNotificationPreference(workspaceId, space.sId, tokenProvider)
            }.onSuccess { preference ->
                _state.update {
                    it.copy(isNotificationLoading = false, notificationPreference = preference)
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isNotificationLoading = false,
                        notificationError = error.message ?: "Failed to load notification settings",
                    )
                }
            }
        }
    }
}
