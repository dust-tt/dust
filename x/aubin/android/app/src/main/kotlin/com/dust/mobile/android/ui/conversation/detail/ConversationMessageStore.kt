package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.optimisticUserMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

internal class ConversationMessageStore(
    state: MutableStateFlow<ConversationDetailState>,
    private val user: User,
) {
    private val _state = state
    private var optimisticUserMessageId: String? = null

    fun addOptimisticUserMessage(content: String) {
        removeOptimisticUserMessage()
        val message = optimisticUserMessage(
            content = content,
            user = user,
            messages = _state.value.messages,
        )
        optimisticUserMessageId = message.id
        insertMessageIfNew(message)
    }

    fun removeOptimisticUserMessage() {
        val id = optimisticUserMessageId ?: return
        optimisticUserMessageId = null
        _state.update { state ->
            state.copy(messages = state.messages.filterNot { it.id == id })
        }
    }

    fun insertMessageIfNew(message: ConversationMessage) {
        _state.update { state ->
            if (state.messages.any { it.id == message.id }) {
                state
            } else {
                state.withMessages((state.messages + message).sortedByRank())
            }
        }
    }

    fun upsertMessage(message: ConversationMessage) {
        _state.update { state ->
            state.withMessages(
                (state.messages.filterNot { it.id == message.id } + message).sortedByRank(),
            )
        }
    }

    fun updateAgentMessageStatus(messageId: String, status: String) {
        val parsed = fallbackAgentMessageDoneStatus(status) ?: return
        _state.update { state ->
            state.copy(
                messages = state.messages.map { item ->
                    if (item is ConversationMessage.Agent && item.message.sId == messageId) {
                        item.copy(message = item.message.copy(status = parsed))
                    } else {
                        item
                    }
                },
            )
        }
    }

    fun promoteUserMessage(messageId: String) {
        _state.update { state ->
            state.copy(
                messages = state.messages.map { item ->
                    if (item is ConversationMessage.User && item.message.sId == messageId) {
                        item.copy(message = item.message.copy(visibility = "visible"))
                    } else {
                        item
                    }
                },
            )
        }
    }
}
