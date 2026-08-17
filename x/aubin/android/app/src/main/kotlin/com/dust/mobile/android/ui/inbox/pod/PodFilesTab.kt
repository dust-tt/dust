package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.ConversationFilesSkeleton
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.core.model.PodFileEntry

@Composable
internal fun PodFilesTab(
    podId: String,
    state: PodState,
    onOpenFolder: (PodFileEntry) -> Unit,
    onOpenParentFolder: () -> Unit,
    onOpenFile: (PodFileEntry) -> Unit,
    onTogglePinnedFrame: (PodFileEntry) -> Unit,
    onRetry: () -> Unit,
) {
    val visibleFiles = state.visibleFiles(podId)
    val canPinFrames = state.details?.isEditor == true && state.details.archivedAt == null
    Column(Modifier.fillMaxSize()) {
        PodFolderHeader(
            currentFolderPath = state.currentFolderPath,
            count = visibleFiles.size,
            onOpenParentFolder = onOpenParentFolder,
        )
        ContentCrossfade(
            targetState = state.isFilesLoading,
            label = "pod-files-loading",
            modifier = Modifier.fillMaxSize(),
        ) { isLoading ->
            when {
                isLoading -> ConversationFilesSkeleton()
                state.filesError != null -> ErrorScreen(state.filesError, onRetry)
                visibleFiles.isEmpty() -> DustFeedbackState(
                    iconRes = R.drawable.ic_folder_24,
                    title = if (state.currentFolderPath.isBlank()) "No files yet" else "This folder is empty",
                    message = if (state.currentFolderPath.isBlank()) {
                        "Files and Frames shared with this Pod appear here."
                    } else {
                        null
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = DustSpacing.large),
                ) {
                    items(visibleFiles, key = { it.path }) { file ->
                        val isPinned = state.details?.pinnedFramePath == file.path
                        PodFileRow(
                            file = file,
                            isPinnedFrame = isPinned,
                            canPinFrames = canPinFrames,
                            onOpen = {
                                if (file.isDirectory) onOpenFolder(file) else onOpenFile(file)
                            },
                            onTogglePinnedFrame = { onTogglePinnedFrame(file) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PodFolderHeader(
    currentFolderPath: String,
    count: Int,
    onOpenParentFolder: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .padding(start = DustSpacing.extraSmall, end = DustSpacing.large),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (currentFolderPath.isNotBlank()) {
            DustIconButton(
                onClick = onOpenParentFolder,
                iconRes = R.drawable.ic_arrow_back_24,
                contentDescription = "Parent folder",
            )
        } else {
            Spacer(Modifier.size(44.dp))
        }
        Text(
            text = currentFolderPath.substringAfterLast('/').ifBlank { "Pod files" },
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.labelLarge,
        )
        Text(
            text = count.toString(),
            color = MaterialTheme.colorScheme.contentMuted,
            style = MaterialTheme.typography.labelMedium,
        )
    }
}
