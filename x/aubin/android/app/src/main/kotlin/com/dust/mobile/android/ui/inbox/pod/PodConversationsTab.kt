package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.IntOffset
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.ConversationRowsSkeleton
import com.dust.mobile.android.ui.common.DustSectionHeader
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.inbox.ConversationEmptyState
import com.dust.mobile.android.ui.inbox.ConversationListCommandBar
import com.dust.mobile.android.ui.inbox.ConversationRow
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space

@Composable
internal fun PodConversationsTab(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspaceId: String,
    space: Space,
    state: PodState,
    onSearch: (String) -> Unit,
    onSelectConversation: (Conversation) -> Unit,
    onNewConversation: () -> Unit,
    onOpenFrame: (() -> Unit)?,
    onRetry: () -> Unit,
    onRetryFrame: () -> Unit,
) {
    val listMotionEnabled = motionEnabled()
    val fadeInSpec = if (listMotionEnabled) {
        tween<Float>(160, easing = LinearOutSlowInEasing)
    } else {
        null
    }
    val placementSpec = if (listMotionEnabled) {
        tween<IntOffset>(180, easing = FastOutSlowInEasing)
    } else {
        null
    }
    val fadeOutSpec = if (listMotionEnabled) {
        tween<Float>(110, easing = FastOutLinearInEasing)
    } else {
        null
    }
    Column(Modifier.fillMaxSize()) {
        state.details?.let { details ->
            PodOverviewHeader(details)
        }
        val pinnedFrame = state.pinnedFrame
        if (pinnedFrame != null && onOpenFrame != null) {
            PodPinnedFrame(
                file = pinnedFrame,
                code = state.pinnedFrameCode,
                isLoading = state.isPinnedFrameLoading,
                error = state.pinnedFrameError,
                appUrl = graph.config.appUrl,
                vizUrl = graph.config.vizUrl,
                fetchFile = { fileId ->
                    graph.fileRepository.fetchFileContent(workspaceId, fileId, tokenProvider)
                },
                onOpen = onOpenFrame,
                onRetry = onRetryFrame,
            )
        }
        Box(Modifier.weight(1f)) {
            ContentCrossfade(
                targetState = state.isConversationsLoading,
                label = "pod-conversations-loading",
                modifier = Modifier.fillMaxSize(),
            ) { isLoading ->
                when {
                    isLoading -> ConversationRowsSkeleton()
                    state.conversationsError != null -> ErrorScreen(state.conversationsError, onRetry)
                    state.groupedConversations.isEmpty() -> ConversationEmptyState(
                        label = if (state.conversationSearch.isBlank()) {
                            "No conversations yet"
                        } else {
                            "No matching conversations"
                        },
                        supportingLabel = if (state.conversationSearch.isBlank()) {
                            "Start the first conversation in ${space.name}."
                        } else {
                            null
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = DustSpacing.large),
                    ) {
                        state.groupedConversations.forEach { group ->
                            item {
                                DustSectionHeader(
                                    label = group.label,
                                    count = group.conversations.size,
                                    modifier = Modifier.animateItem(
                                        fadeInSpec = fadeInSpec,
                                        placementSpec = placementSpec,
                                        fadeOutSpec = fadeOutSpec,
                                    ),
                                )
                            }
                            items(group.conversations, key = { it.sId }) { conversation ->
                                ConversationRow(
                                    conversation = conversation,
                                    modifier = Modifier.animateItem(
                                        fadeInSpec = fadeInSpec,
                                        placementSpec = placementSpec,
                                        fadeOutSpec = fadeOutSpec,
                                    ),
                                    onOpen = { onSelectConversation(conversation) },
                                    showActions = false,
                                    supportingText = conversation.description,
                                    onToggleRead = {},
                                    onDelete = {},
                                )
                            }
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = androidx.compose.material3.MaterialTheme.colorScheme.subtleBorder)
        ConversationListCommandBar(
            searchText = state.conversationSearch,
            onSearch = onSearch,
            onNewConversation = onNewConversation,
        )
    }
}
