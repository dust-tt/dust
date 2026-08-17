package com.dust.mobile.android.ui.conversation.files

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.R
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.ConversationFilesSkeleton
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.DustSectionHeader
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.AttachmentCategory
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationAttachment

@Composable
internal fun ConversationFilesScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    conversation: Conversation,
    onOpenAttachment: (ConversationAttachment) -> Unit,
) {
    val viewModel: ConversationFilesViewModel = viewModel(
        key = "files-${conversation.sId}",
        factory = factory {
            ConversationFilesViewModel(graph, tokenProvider, isLocalPreview, workspaceId, conversation.sId)
        },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(conversation.sId) {
        viewModel.load()
    }

    ConversationFilesContent(
        state = state,
        onRetry = viewModel::retry,
        onOpenAttachment = onOpenAttachment,
    )
}

@Composable
internal fun ConversationFilesContent(
    state: ConversationFilesState,
    onRetry: () -> Unit,
    onOpenAttachment: (ConversationAttachment) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        ContentCrossfade(
            targetState = state.isLoading,
            label = "conversation-files-loading",
            modifier = Modifier.fillMaxSize(),
        ) { isLoading ->
            if (isLoading) {
                ConversationFilesSkeleton()
            } else when {
                state.error != null -> ErrorScreen(state.error ?: "Failed to load files", onRetry)
                state.attachments.isEmpty() -> DustFeedbackState(
                    iconRes = R.drawable.ic_document_24,
                    title = "No files in this conversation",
                    modifier = Modifier.fillMaxSize(),
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = DustSpacing.extraLarge),
                ) {
                    AttachmentCategory.entries.forEach { category ->
                        val attachments = state.attachments.filter { it.category == category }
                        if (attachments.isNotEmpty()) {
                            item {
                                DustSectionHeader(
                                    label = category.displayName,
                                    count = attachments.size,
                                )
                            }
                            items(attachments, key = { it.id }) { attachment ->
                                FileRow(attachment = attachment, onOpen = { onOpenAttachment(attachment) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FileRow(attachment: ConversationAttachment, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = attachment.fileId != null, onClick = onOpen)
            .heightIn(min = DustDimensions.rowMinimumHeight)
            .padding(
                horizontal = DustDimensions.pageHorizontalPadding,
                vertical = DustSpacing.extraSmall,
            ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FileIconTile(attachment = attachment)
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        ) {
            Text(
                attachment.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.contentStrong,
            )
            attachment.source?.let { source ->
                Text(
                    "by $source",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.contentMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (attachment.fileId != null) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier.size(DustDimensions.inlineIcon),
                tint = MaterialTheme.colorScheme.contentMuted,
            )
        }
    }
}

@Composable
private fun FileIconTile(attachment: ConversationAttachment) {
    val isAccent = attachment.isFrame
    Icon(
        painter = painterResource(
            when {
                attachment.isFrame -> R.drawable.ic_frame_24
                attachment.isImage -> R.drawable.ic_image_24
                else -> R.drawable.ic_document_24
            },
        ),
        contentDescription = null,
        modifier = Modifier.size(DustDimensions.contentIcon),
        tint = if (isAccent) {
            MaterialTheme.colorScheme.action
        } else {
            MaterialTheme.colorScheme.contentMuted
        },
    )
}
