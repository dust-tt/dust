package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.User
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ConversationOfflineCacheController(
    private val graph: AppGraph,
    private val activeUser: User,
    private val workspaceId: String,
    private val conversationId: String,
    private val state: MutableStateFlow<ConversationDetailState>,
    private val coroutineScope: CoroutineScope,
    private val isLocalPreview: Boolean,
) {
    private var didRestore = false

    suspend fun restore() {
        if (didRestore || isLocalPreview || state.value.messages.isNotEmpty()) return
        didRestore = true
        graph.offlineCacheRepository.cachedConversation(
            userId = activeUser.id,
            workspaceId = workspaceId,
            conversationId = conversationId,
        )?.let { cached ->
            state.update {
                it.withMessages(cached.messages).copy(
                    isLoading = false,
                    hasMore = cached.hasMore,
                    lastValue = cached.lastValue,
                )
            }
        }
    }

    @OptIn(FlowPreview::class)
    fun startPersisting() {
        if (isLocalPreview) return
        coroutineScope.launch {
            state
                .map { detailState ->
                    CachedMessageState(
                        messages = detailState.messages.filterNot { message ->
                            message is ConversationMessage.User && message.message.isPending
                        },
                        hasMore = detailState.hasMore,
                        streamingMessageId = detailState.streamingMessageId,
                    )
                }
                .filter(CachedMessageState::canPersist)
                .distinctUntilChanged()
                .debounce(MESSAGE_CACHE_DEBOUNCE_MS)
                .collect { cached ->
                    graph.offlineCacheRepository.cacheConversation(
                        activeUser = activeUser,
                        workspaceId = workspaceId,
                        conversationId = conversationId,
                        messages = cached.messages,
                        hasMore = cached.hasMore,
                    )
                }
        }
    }

    private data class CachedMessageState(
        val messages: List<ConversationMessage>,
        val hasMore: Boolean,
        val streamingMessageId: String?,
    ) {
        fun canPersist(): Boolean =
            messages.isNotEmpty() &&
                streamingMessageId == null &&
                messages.none { message ->
                    message is ConversationMessage.Agent && message.message.isStreaming
                }
    }

    private companion object {
        const val MESSAGE_CACHE_DEBOUNCE_MS = 750L
    }
}
