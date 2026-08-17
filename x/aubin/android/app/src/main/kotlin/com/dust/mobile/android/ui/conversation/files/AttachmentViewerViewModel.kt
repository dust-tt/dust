package com.dust.mobile.android.ui.conversation.files

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewFileData
import com.dust.mobile.core.auth.TokenProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AttachmentViewerState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val data: ByteArray? = null,
) {
    override fun equals(other: Any?): Boolean =
        other is AttachmentViewerState &&
            isLoading == other.isLoading &&
            error == other.error &&
            ((data == null && other.data == null) ||
                (data != null && other.data != null && data.contentEquals(other.data)))

    override fun hashCode(): Int {
        var result = isLoading.hashCode()
        result = 31 * result + (error?.hashCode() ?: 0)
        result = 31 * result + (data?.contentHashCode() ?: 0)
        return result
    }
}

class AttachmentViewerViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    private val fileId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(AttachmentViewerState())
    val state: StateFlow<AttachmentViewerState> = _state.asStateFlow()

    fun load() {
        if (isLocalPreview) {
            _state.value = AttachmentViewerState(
                isLoading = false,
                data = localPreviewFileData(fileId),
            )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.fileRepository.fetchFileData(workspaceId, fileId, tokenProvider)
            }.onSuccess { data ->
                _state.update { it.copy(isLoading = false, data = data) }
            }.onFailure { error ->
                _state.update {
                    it.copy(isLoading = false, error = error.message ?: "Failed to load file")
                }
            }
        }
    }
}
