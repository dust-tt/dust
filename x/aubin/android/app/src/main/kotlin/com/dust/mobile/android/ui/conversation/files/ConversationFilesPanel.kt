package com.dust.mobile.android.ui.conversation.files

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.DustModalHeader
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationAttachment

@Composable
internal fun ConversationFilesPanel(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    conversation: Conversation,
    onClose: () -> Unit,
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

    Column(Modifier.fillMaxSize()) {
        DustModalHeader(
            title = "Files & Frames",
            onClose = onClose,
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
        ConversationFilesContent(
            state = state,
            onRetry = viewModel::retry,
            onOpenAttachment = onOpenAttachment,
            modifier = Modifier.weight(1f),
        )
    }
}
