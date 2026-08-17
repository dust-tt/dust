package com.dust.mobile.android.ui.conversation.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewAttachments
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.ConversationAttachment
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class ConversationFilesState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val attachments: List<ConversationAttachment> = emptyList(),
)

class ConversationFilesViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    private val conversationId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationFilesState())
    val state: StateFlow<ConversationFilesState> = _state.asStateFlow()
    private var hasLoaded = false
    private var loadJob: Job? = null

    fun load(force: Boolean = false) {
        if (loadJob?.isActive == true || (!force && hasLoaded)) return
        if (isLocalPreview) {
            hasLoaded = true
            _state.value = ConversationFilesState(
                isLoading = false,
                attachments = localPreviewAttachments(conversationId),
            )
            return
        }
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.fileRepository.fetchAttachments(workspaceId, conversationId, tokenProvider)
            }.onSuccess { attachments ->
                hasLoaded = true
                _state.update { it.copy(isLoading = false, attachments = attachments) }
            }.onFailure { error ->
                hasLoaded = true
                _state.update {
                    it.copy(isLoading = false, error = error.message ?: "Failed to load files")
                }
            }
        }
    }

    fun retry() = load(force = true)
}
