package com.dust.mobile.android.ui.inbox.pod

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewFileData
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.decodeUtf8TextOrNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class PodFrameController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean,
    private val workspaceId: String,
    private val podId: String,
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<PodState>,
) {
    fun load() {
        val file = state.value.pinnedFrame ?: return
        val fileId = file.fileId ?: return
        if (state.value.pinnedFrameFileId == fileId && state.value.pinnedFrameCode != null) return
        scope.launch {
            state.update { it.copy(isPinnedFrameLoading = true, pinnedFrameError = null) }
            runCatching {
                val data = if (isLocalPreview) {
                    localPreviewFileData(fileId)
                } else {
                    graph.fileRepository.fetchFileData(workspaceId, fileId, tokenProvider)
                }
                decodeUtf8TextOrNull(data) ?: error("This Frame has no readable content")
            }.onSuccess { code ->
                state.update {
                    it.copy(
                        pinnedFrameCode = code,
                        pinnedFrameFileId = fileId,
                        isPinnedFrameLoading = false,
                    )
                }
            }.onFailure { error ->
                state.update {
                    it.copy(
                        isPinnedFrameLoading = false,
                        pinnedFrameError = error.message ?: "Failed to load pinned Frame",
                    )
                }
            }
        }
    }

    fun update(file: PodFileEntry?) {
        if (state.value.isPinUpdating) return
        scope.launch {
            state.update { it.copy(isPinUpdating = true, actionError = null) }
            runCatching {
                if (!isLocalPreview) {
                    graph.podRepository.updatePinnedFrame(workspaceId, podId, file?.path, tokenProvider)
                }
            }.onSuccess {
                state.update { current ->
                    current.copy(
                        isPinUpdating = false,
                        details = current.details?.copy(pinnedFramePath = file?.path),
                        pinnedFrameCode = if (file == null) null else current.pinnedFrameCode,
                        pinnedFrameFileId = if (file == null) null else current.pinnedFrameFileId,
                    )
                }
                load()
            }.onFailure { error ->
                state.update {
                    it.copy(isPinUpdating = false, actionError = error.message ?: "Failed to update pinned Frame")
                }
            }
        }
    }

    fun retry() {
        state.update { it.copy(pinnedFrameFileId = null, pinnedFrameCode = null) }
        load()
    }
}
