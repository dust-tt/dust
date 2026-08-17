package com.dust.mobile.android.ui.conversation.files

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.R
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.AttachmentViewerSkeleton
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.frame.FrameContentView
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.AttachmentPreviewRoute
import com.dust.mobile.core.model.attachmentPreviewRoute
import com.dust.mobile.core.model.decodeUtf8TextOrNull
import com.dust.mobile.core.repository.FrameFileContent

@Composable
internal fun AttachmentViewerScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    title: String,
    contentType: String,
    fileId: String,
    sourceUrl: String?,
) {
    val viewModel: AttachmentViewerViewModel = viewModel(
        key = "viewer-$fileId",
        factory = factory { AttachmentViewerViewModel(graph, tokenProvider, isLocalPreview, workspaceId, fileId) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current

    LaunchedEffect(fileId) {
        viewModel.load()
    }

    ContentCrossfade(
        targetState = state.isLoading,
        label = "attachment-viewer-loading",
        modifier = Modifier.fillMaxSize(),
    ) { isLoading ->
        val data = state.data
        if (isLoading) {
            AttachmentViewerSkeleton()
        } else when {
            state.error != null -> ErrorScreen(state.error ?: "Failed to load file", viewModel::load)
            data != null -> AttachmentContent(
                    title = title,
                    contentType = contentType,
                    fileId = fileId,
                    data = data,
                    appUrl = graph.config.appUrl,
                    vizUrl = graph.config.vizUrl,
                    sourceUrl = sourceUrl,
                    onOpenSource = { url -> uriHandler.openUri(url) },
                    fetchFrameFile = { targetFileId ->
                        graph.fileRepository.fetchFileContent(workspaceId, targetFileId, tokenProvider)
                    },
                )
        }
    }
}

@Composable
private fun AttachmentContent(
    title: String,
    contentType: String,
    fileId: String,
    data: ByteArray,
    appUrl: String,
    vizUrl: String,
    sourceUrl: String?,
    onOpenSource: (String) -> Unit,
    fetchFrameFile: suspend (String) -> FrameFileContent,
) {
    val textPreview = remember(data) { decodeUtf8TextOrNull(data) }
    when (remember(contentType, data) { attachmentPreviewRoute(contentType, data) }) {
        AttachmentPreviewRoute.FRAME -> {
            val code = textPreview ?: return
            FrameContentView(
                code = code,
                fileId = fileId,
                appUrl = appUrl,
                vizUrl = vizUrl,
                fetchFile = fetchFrameFile,
            )
        }
        AttachmentPreviewRoute.IMAGE -> ImagePreview(title, data)
        AttachmentPreviewRoute.PDF -> PdfPreview(data)
        AttachmentPreviewRoute.TEXT -> TextPreview(textPreview ?: return)
        AttachmentPreviewRoute.OTHER -> DustFeedbackState(
            iconRes = R.drawable.ic_document_24,
            title = "Preview unavailable",
            message = "This file type cannot be previewed in Dust.",
            actionLabel = sourceUrl?.let { "Open source" },
            onAction = sourceUrl?.let { url -> { onOpenSource(url) } },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
