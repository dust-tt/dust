package com.dust.mobile.core.model

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

data class ConversationListData(
    val conversations: List<Conversation>,
    val pods: List<Space>,
)

suspend fun loadConversationListData(
    fetchConversations: suspend () -> List<Conversation>,
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

    ConversationListData(
        conversations = conversations.await(),
        pods = pods.await(),
    )
}
