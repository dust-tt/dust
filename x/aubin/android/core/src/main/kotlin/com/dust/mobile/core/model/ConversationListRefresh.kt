package com.dust.mobile.core.model

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

data class ConversationListData(
    val conversations: List<Conversation>,
    val pods: List<Space>,
    val hasMore: Boolean = false,
    val lastValue: String? = null,
)

suspend fun loadConversationListData(
    fetchConversations: suspend () -> ConversationsResponse,
    fetchPods: suspend () -> List<Space>,
): ConversationListData = coroutineScope {
    val conversations = async { fetchConversations() }
    val pods = async {
        try {
            fetchPods()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            emptyList()
        }
    }

    val page = conversations.await()
    ConversationListData(
        conversations = page.conversations,
        pods = pods.await(),
        hasMore = page.hasMore,
        lastValue = page.lastValue,
    )
}
