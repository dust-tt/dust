package com.dust.mobile.android.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewMessages
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import kotlin.math.min
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CatchUpState(
    val conversations: List<Conversation>,
    val currentIndex: Int = 0,
    val messages: List<ConversationMessage> = emptyList(),
    val markedAsReadIds: Set<String> = emptySet(),
    val isLoadingMessages: Boolean = false,
    val isFlushing: Boolean = false,
    val hasFlushed: Boolean = false,
    val error: String? = null,
) {
    val currentConversation: Conversation?
        get() = conversations.getOrNull(currentIndex)

    val isDone: Boolean
        get() = currentIndex >= conversations.size

    val progressText: String
        get() {
            if (conversations.isEmpty()) return "0 of 0"
            return "${min(currentIndex + 1, conversations.size)} of ${conversations.size}"
    }
}

internal fun CatchUpState.canStartFlush(): Boolean =
    !hasFlushed && !isFlushing && markedAsReadIds.isNotEmpty()

internal fun CatchUpState.flushStarted(): CatchUpState =
    copy(isFlushing = true, hasFlushed = true)

internal fun CatchUpState.flushSucceeded(): CatchUpState =
    copy(isFlushing = false)

internal fun CatchUpState.flushFailed(error: String): CatchUpState =
    copy(
        isFlushing = false,
        hasFlushed = false,
        error = error,
    )

class CatchUpViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    conversations: List<Conversation>,
) : ViewModel() {
    private val _state = MutableStateFlow(CatchUpState(conversations = conversations))
    val state: StateFlow<CatchUpState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        loadCurrentMessages()
    }

    fun loadCurrentMessages() {
        val conversation = _state.value.currentConversation ?: return
        val expectedIndex = _state.value.currentIndex
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoadingMessages = true, messages = emptyList(), error = null) }
            if (isLocalPreview) {
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(
                            isLoadingMessages = false,
                            messages = localPreviewMessages(conversation.sId),
                        )
                    } else {
                        state
                    }
                }
                return@launch
            }
            runCatching {
                graph.conversationRepository.fetchMessages(
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    tokenProvider = tokenProvider,
                    limit = 10,
                ).messages.sortedWith(compareBy<ConversationMessage> { it.rank }.thenBy { it.created })
            }.onSuccess { messages ->
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(isLoadingMessages = false, messages = messages)
                    } else {
                        state
                    }
                }
            }.onFailure { error ->
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(
                            isLoadingMessages = false,
                            error = error.message ?: "Failed to load messages",
                        )
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun markAsRead() {
        val conversation = _state.value.currentConversation ?: return
        _state.update { it.copy(markedAsReadIds = it.markedAsReadIds + conversation.sId) }
        advance()
    }

    fun keepForLater() {
        advance()
    }

    fun dismiss(onDismiss: (Set<String>) -> Unit) {
        val markedIds = _state.value.markedAsReadIds
        viewModelScope.launch { flush() }
        onDismiss(markedIds)
    }

    private fun advance() {
        loadJob?.cancel()
        _state.update {
            it.copy(
                currentIndex = it.currentIndex + 1,
                messages = emptyList(),
                isLoadingMessages = false,
                error = null,
            )
        }
        if (_state.value.isDone) {
            viewModelScope.launch { flush() }
        } else {
            loadCurrentMessages()
        }
    }

    private suspend fun flush() {
        val state = _state.value
        if (!state.canStartFlush()) return
        if (isLocalPreview) {
            _state.update { it.flushSucceeded().copy(hasFlushed = true) }
            return
        }
        _state.update { it.flushStarted() }
        runCatching {
            graph.conversationRepository.bulkMarkAsRead(
                workspaceId = workspaceId,
                conversationIds = state.markedAsReadIds.toList(),
                tokenProvider = tokenProvider,
            )
        }.onSuccess {
            _state.update { it.flushSucceeded() }
        }.onFailure { error ->
            _state.update {
                it.flushFailed(error.message ?: "Failed to mark conversations as read")
            }
        }
    }
}
