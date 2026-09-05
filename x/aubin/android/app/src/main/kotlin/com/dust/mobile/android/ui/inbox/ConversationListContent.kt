package com.dust.mobile.android.ui.inbox

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.Icon
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.ConversationRowsSkeleton
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.SavedContentBanner
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationListContent(
    state: ConversationListState,
    onSelectPod: (Space) -> Unit,
    onTogglePodsExpanded: () -> Unit,
    onSelectConversation: (Conversation) -> Unit,
    onToggleRead: (Conversation) -> Unit,
    onDelete: (Conversation) -> Unit,
    onCatchUp: (() -> Unit)?,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    onLoadMore: () -> Unit = {},
    onRetrySearch: () -> Unit = {},
) {
    PullToRefreshBox(
        isRefreshing = if (state.searchText.isBlank()) state.isRefreshing else state.search.isLoading,
        onRefresh = if (state.searchText.isBlank()) onRefresh else onRetrySearch,
        modifier = modifier.fillMaxSize(),
    ) {
        ContentCrossfade(
            targetState = state.bodyState,
            label = "conversation-list-content",
            modifier = Modifier.fillMaxSize(),
        ) { bodyState ->
            when (bodyState) {
                ConversationListBodyState.LOADING -> ConversationRowsSkeleton(
                    rowCount = 7,
                    showPods = true,
                    topPadding = DustSpacing.small,
                )
                ConversationListBodyState.ERROR -> ErrorScreen(
                    message = state.error ?: "Failed to load conversations",
                    onRetry = onRefresh,
                )
                ConversationListBodyState.CONTENT -> ConversationListRows(
                    state = state,
                    onSelectPod = onSelectPod,
                    onTogglePodsExpanded = onTogglePodsExpanded,
                    onSelectConversation = onSelectConversation,
                    onToggleRead = onToggleRead,
                    onDelete = onDelete,
                    onCatchUp = onCatchUp,
                    onRefresh = onRefresh,
                    onLoadMore = onLoadMore,
                    onRetrySearch = onRetrySearch,
                )
            }
        }
    }
}

@Composable
private fun ConversationListRows(
    state: ConversationListState,
    onSelectPod: (Space) -> Unit,
    onTogglePodsExpanded: () -> Unit,
    onSelectConversation: (Conversation) -> Unit,
    onToggleRead: (Conversation) -> Unit,
    onDelete: (Conversation) -> Unit,
    onCatchUp: (() -> Unit)?,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onRetrySearch: () -> Unit,
) {
    val listMotionEnabled = motionEnabled()
    val listFadeInSpec = if (listMotionEnabled) {
        tween<Float>(durationMillis = 160, easing = LinearOutSlowInEasing)
    } else {
        null
    }
    val listPlacementSpec = if (listMotionEnabled) {
        tween<IntOffset>(durationMillis = 180, easing = FastOutSlowInEasing)
    } else {
        null
    }
    val listFadeOutSpec = if (listMotionEnabled) {
        tween<Float>(durationMillis = 110, easing = FastOutLinearInEasing)
    } else {
        null
    }
    val podNamesById = remember(state.pods) { state.pods.associate { it.sId to it.name } }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = DustSpacing.large),
    ) {
        state.refreshError?.let { error ->
            item(key = "refresh-error") {
                SavedContentBanner(
                    message = error,
                    retryContentDescription = "Retry loading conversations",
                    onRetry = onRefresh,
                )
            }
        }
        state.pods.takeIf { it.isNotEmpty() && state.searchText.isBlank() }?.let { pods ->
            item(key = "pods-header") {
                val chevronRotation by animateFloatAsState(
                    targetValue = if (state.isPodsExpanded) 0f else -90f,
                    animationSpec = tween(durationMillis = if (listMotionEnabled) 160 else 0),
                    label = "pods-chevron",
                )
                Row(
                    modifier = Modifier
                        .animateItem(
                            fadeInSpec = listFadeInSpec,
                            placementSpec = listPlacementSpec,
                            fadeOutSpec = listFadeOutSpec,
                        )
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceContainerLow)
                        .clickable(onClick = onTogglePodsExpanded)
                        .heightIn(min = DustDimensions.controlHeight)
                        .padding(horizontal = DustDimensions.pageHorizontalPadding),
                    horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_space_open_24),
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Pods",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        pods.size.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.64f),
                    )
                    Spacer(Modifier.weight(1f))
                    Icon(
                        painter = painterResource(R.drawable.ic_expand_more_24),
                        contentDescription = if (state.isPodsExpanded) "Collapse pods" else "Expand pods",
                        modifier = Modifier
                            .size(14.dp)
                            .graphicsLayer { rotationZ = chevronRotation },
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (state.isPodsExpanded) {
                items(pods, key = { "pod-${it.sId}" }) { pod ->
                    PodLink(
                        space = pod,
                        onClick = { onSelectPod(pod) },
                        modifier = Modifier.animateItem(
                            fadeInSpec = listFadeInSpec,
                            placementSpec = listPlacementSpec,
                            fadeOutSpec = listFadeOutSpec,
                        ),
                    )
                }
            }
        }
        if (state.groupedConversations.isEmpty() && !state.search.isLoading) {
            item(key = "empty-state") {
                ConversationEmptyState(
                    label = conversationListEmptyLabel(state.searchText),
                    supportingLabel = if (state.searchText.isEmpty()) {
                        "Start a conversation with an agent."
                    } else {
                        null
                    },
                    modifier = Modifier
                        .animateItem(
                            fadeInSpec = listFadeInSpec,
                            placementSpec = listPlacementSpec,
                            fadeOutSpec = listFadeOutSpec,
                        )
                        .fillMaxWidth()
                        .padding(24.dp),
                )
            }
        }
        state.groupedConversations.forEach { group ->
            item(key = "group-${group.label}") {
                ConversationFocusSectionHeader(
                    label = group.label,
                    count = group.conversations.size,
                    onCatchUp = onCatchUp.takeIf {
                        group.label == "Needs you" && state.searchText.isEmpty()
                    },
                    modifier = Modifier.animateItem(
                        fadeInSpec = listFadeInSpec,
                        placementSpec = listPlacementSpec,
                        fadeOutSpec = listFadeOutSpec,
                    ),
                )
            }
            items(group.conversations, key = { it.sId }) { conversation ->
                ConversationRow(
                    conversation = conversation,
                    podName = conversation.spaceId?.let(podNamesById::get),
                    modifier = Modifier.animateItem(
                        fadeInSpec = listFadeInSpec,
                        placementSpec = listPlacementSpec,
                        fadeOutSpec = listFadeOutSpec,
                    ),
                    onOpen = { onSelectConversation(conversation) },
                    onToggleRead = { onToggleRead(conversation) },
                    onDelete = { onDelete(conversation) },
                )
            }
        }
        item(key = "discovery-footer") {
            ConversationDiscoveryFooter(state, onLoadMore, onRetrySearch)
        }
    }
}
