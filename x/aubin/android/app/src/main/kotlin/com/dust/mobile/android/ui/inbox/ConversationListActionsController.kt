package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ConversationListActionsController(
    private val state: MutableStateFlow<ConversationListState>,
    private val scope: CoroutineScope,
    private val setReadStatus: suspend (String, String, Boolean) -> Unit,
    private val delete: suspend (String, String) -> Unit,
    private val onChanged: (String) -> Unit,
    private val onDeleted: (String, String) -> Unit,
) {
    private val pending = mutableSetOf<Pair<String, String>>()

    fun toggleReadStatus(conversation: Conversation) {
        val workspaceId = state.value.workspace?.sId ?: return
        val key = workspaceId to conversation.sId
        if (!pending.add(key)) return
        val read = conversation.unread || conversation.actionRequired
        state.update { current ->
            current.mapConversations {
                if (it.sId == conversation.sId) it.copy(unread = !read, actionRequired = false) else it
            }.copy(actionError = null)
        }
        onChanged(workspaceId)
        scope.launch {
            try {
                setReadStatus(workspaceId, conversation.sId, read)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                state.update { current ->
                    if (current.workspace?.sId != workspaceId) current else current.mapConversations {
                        if (it.sId == conversation.sId) {
                            it.copy(unread = conversation.unread, actionRequired = conversation.actionRequired)
                        } else it
                    }.copy(actionError = "Couldn't update read status. Try again.")
                }
            } finally {
                pending.remove(key)
                onChanged(workspaceId)
            }
        }
    }

    fun deleteConversation(conversation: Conversation) {
        val snapshot = state.value
        val workspaceId = snapshot.workspace?.sId ?: return
        val key = workspaceId to conversation.sId
        if (!pending.add(key)) return
        state.update { current ->
            current.copy(
                conversations = current.conversations.filterNot { it.sId == conversation.sId },
                search = current.search.copy(results = current.search.results?.filterNot { it.sId == conversation.sId }),
                actionError = null,
            )
        }
        onChanged(workspaceId)
        scope.launch {
            try {
                delete(workspaceId, conversation.sId)
                onDeleted(workspaceId, conversation.sId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                state.update { current ->
                    if (current.workspace?.sId != workspaceId) current else current.copy(
                        conversations = current.conversations.restore(conversation, snapshot.conversations),
                        search = if (current.searchText.trim() == snapshot.searchText.trim()) {
                            current.search.copy(
                                results = current.search.results?.restore(conversation, snapshot.search.results.orEmpty()),
                            )
                        } else current.search,
                        actionError = "Couldn't delete the conversation. Try again.",
                    )
                }
            } finally {
                pending.remove(key)
                onChanged(workspaceId)
            }
        }
    }

    fun markConversationsAsRead(ids: Set<String>) {
        if (ids.isEmpty()) return
        state.update { current ->
            current.mapConversations {
                if (it.sId in ids) it.copy(unread = false, actionRequired = false) else it
            }
        }
        state.value.workspace?.sId?.let(onChanged)
    }

    fun updateTitle(id: String, title: String) {
        state.update { current ->
            current.mapConversations { if (it.sId == id) it.copy(title = title) else it }
        }
        state.value.workspace?.sId?.let(onChanged)
    }
}

private fun ConversationListState.mapConversations(transform: (Conversation) -> Conversation) = copy(
    conversations = conversations.map(transform),
    search = search.copy(results = search.results?.map(transform)),
)

private fun List<Conversation>.restore(conversation: Conversation, original: List<Conversation>): List<Conversation> {
    val index = original.indexOfFirst { it.sId == conversation.sId }
    if (index < 0 || any { it.sId == conversation.sId }) return this
    return toMutableList().apply { add(index.coerceAtMost(size), conversation) }
}
