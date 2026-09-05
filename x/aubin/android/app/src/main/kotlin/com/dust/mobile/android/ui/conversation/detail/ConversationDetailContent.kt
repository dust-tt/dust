package com.dust.mobile.android.ui.conversation.detail

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.ConversationDetailSkeleton
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.SavedContentBanner
import com.dust.mobile.android.ui.message.MessageBubble
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.inlineBlockedStateForMessage

@Composable
internal fun ConversationDetailContent(
    state: ConversationDetailState,
    user: User,
    currentUserSId: String?,
    hiddenAgentHeaderIds: Set<String>,
    listState: LazyListState,
    contentPadding: PaddingValues,
    onRetryLoad: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenContentFragment: (ContentFragment) -> Unit,
    loadContentFragmentImage: suspend (String) -> ByteArray?,
    onOpenFile: (GeneratedFile) -> Unit,
    onRetryMessage: (String) -> Unit,
    onValidateAction: (ActionApproval) -> Unit,
    onAnswerQuestion: (UserQuestionAnswer) -> Unit,
    onOpenInBrowser: (() -> Unit)?,
) {
    val isInitialLoading = state.isLoading && state.messages.isEmpty()
    val initialError = state.error?.takeIf { state.messages.isEmpty() }
    val uriHandler = LocalUriHandler.current

    Box(Modifier.fillMaxSize()) {
        ContentCrossfade(
            targetState = isInitialLoading,
            label = "conversation-detail-loading",
            modifier = Modifier.fillMaxSize(),
        ) { initialLoading ->
            when {
                initialLoading -> ConversationDetailSkeleton(Modifier.padding(contentPadding))
                initialError != null -> Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding),
                ) {
                    ErrorScreen(
                        message = initialError,
                        onRetry = onRetryLoad,
                    )
                }
                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding)
                        .padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 20.dp),
                ) {
                    state.refreshError?.let { error ->
                        item(key = "saved-messages-notice") {
                            SavedContentBanner(
                                message = error,
                                retryContentDescription = "Retry loading messages",
                                onRetry = onRetryLoad,
                                modifier = Modifier.padding(bottom = 12.dp),
                            )
                        }
                    }
                    if (state.hasMore) {
                        item {
                            DustButton(
                                label = "Load older messages",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 16.dp),
                                enabled = !state.isLoadingMore,
                                loading = state.isLoadingMore,
                                variant = DustButtonVariant.Text,
                                onClick = onLoadMore,
                            )
                        }
                    }
                    itemsIndexed(state.messages, key = { _, message -> message.id }) { index, message ->
                        val inlineActivity = state.inlineActivities[message.id]
                        val inlineBlockedState = inlineBlockedStateForMessage(
                            message = message,
                            streamingMessageId = state.streamingMessageId,
                            blockedState = state.blockedState,
                        )
                        val hidesAgentHeader = message.id in hiddenAgentHeaderIds
                        Box(
                            modifier = Modifier.padding(
                                top = conversationMessageTopSpacing(
                                    previousMessage = state.messages.getOrNull(index - 1),
                                    message = message,
                                    hidesAgentHeader = hidesAgentHeader,
                                ),
                            ),
                        ) {
                            MessageBubble(
                                message = message,
                                currentUserEmail = user.email,
                                currentUserSId = currentUserSId,
                                lastError = state.lastError?.takeIf { it.messageId == message.id },
                                hideAgentHeader = hidesAgentHeader,
                                streamingActivity = inlineActivity?.activity,
                                activeActions = inlineActivity?.activeActions.orEmpty(),
                                completedSteps = inlineActivity?.completedSteps.orEmpty(),
                                blockedState = inlineBlockedState,
                                isValidatingAction = state.isValidatingAction,
                                actionError = state.actionError.takeIf { inlineBlockedState != null },
                                onOpenContentFragment = onOpenContentFragment,
                                loadContentFragmentImage = loadContentFragmentImage,
                                onOpenGeneratedFile = onOpenFile,
                                onOpenCitation = { citation -> citation.href?.let(uriHandler::openUri) },
                                onRetryMessage = onRetryMessage,
                                onValidateAction = onValidateAction,
                                onAnswerQuestion = onAnswerQuestion,
                                onOpenInBrowser = onOpenInBrowser,
                            )
                        }
                    }
                    item(key = "conversation-bottom-anchor") {
                        Spacer(Modifier.height(1.dp))
                    }
                }
            }
        }
        if (!isInitialLoading && initialError == null) {
            ConversationJumpToLatest(
                listState = listState,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(contentPadding)
                    .padding(bottom = 12.dp),
            )
        }
    }
}
