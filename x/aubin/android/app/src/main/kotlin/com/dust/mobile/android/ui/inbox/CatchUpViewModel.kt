package com.dust.mobile.android.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewMessages
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CatchUpViewModel internal constructor(
    conversations: List<Conversation>,
    private val fetchMessages: suspend (Conversation) -> List<ConversationMessage>,
    private val saveReadStatus: suspend (Set<String>) -> Unit,
) : ViewModel() {
    constructor(
        graph: AppGraph,
        tokenProvider: TokenProvider,
        isLocalPreview: Boolean,
        workspaceId: String,
        conversations: List<Conversation>,
    ) : this(
        conversations = conversations,
        fetchMessages = { conversation ->
            if (isLocalPreview) {
                localPreviewMessages(conversation.sId)
            } else {
                graph.conversationRepository.fetchMessages(
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    tokenProvider = tokenProvider,
                    limit = 10,
                ).messages
            }
        },
        saveReadStatus = { ids ->
            if (!isLocalPreview) {
                graph.conversationRepository.bulkMarkAsRead(workspaceId, ids.toList(), tokenProvider)
            }
        },
    )
    private val _state = MutableStateFlow(CatchUpState(conversations = conversations))
    val state: StateFlow<CatchUpState> = _state.asStateFlow()
    private var loadJob: Job? = null
    private var saveJob: Job? = null
    private var activeSessionId: String? = null

    init {
        loadCurrentMessages()
    }

    fun startSession(sessionId: String, conversations: List<Conversation>) {
        if (activeSessionId == sessionId) return
        val isFirstSession = activeSessionId == null
        activeSessionId = sessionId
        if (!isFirstSession) {
            loadJob?.cancel()
            saveJob?.cancel()
            _state.value = CatchUpState(conversations = conversations)
            loadCurrentMessages()
        }
    }

    fun loadCurrentMessages() {
        val conversation = _state.value.currentConversation ?: return
        val expectedIndex = _state.value.currentIndex
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoadingMessages = true, messages = emptyList(), error = null) }
            runCatching {
                fetchMessages(conversation)
                    .sortedWith(compareBy<ConversationMessage> { it.rank }.thenBy { it.created })
            }.onSuccess { messages ->
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(isLoadingMessages = false, messages = messages)
                    } else {
                        state
                    }
                }
            }.onFailure { error ->
                if (error is CancellationException) throw error
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
        if (_state.value.isFlushing) return
        val conversation = _state.value.currentConversation ?: return
        _state.update { it.copy(markedAsReadIds = it.markedAsReadIds + conversation.sId) }
        advance()
    }

    fun keepForLater() {
        if (_state.value.isFlushing) return
        advance()
    }

    fun undoLastReview() {
        val state = _state.value
        if (state.currentIndex == 0 || state.isFlushing || state.hasFlushed) return
        val previousIndex = state.currentIndex - 1
        val previousConversation = state.conversations[previousIndex]
        _state.update {
            it.copy(
                currentIndex = previousIndex,
                markedAsReadIds = it.markedAsReadIds - previousConversation.sId,
                saveError = null,
            )
        }
        loadCurrentMessages()
    }

    fun dismiss(onDismiss: (Set<String>) -> Unit) {
        val state = _state.value
        if (state.isFlushing) return
        if (!state.canStartFlush()) {
            onDismiss(state.markedAsReadIds)
            return
        }
        _state.update { it.flushStarted() }
        saveJob = viewModelScope.launch {
            try {
                saveReadStatus(state.markedAsReadIds)
                _state.update { it.flushSucceeded() }
                onDismiss(state.markedAsReadIds)
            } catch (error: CancellationException) {
                _state.update { it.copy(isFlushing = false) }
                throw error
            } catch (error: Exception) {
                _state.update {
                    it.flushFailed("Couldn't save your read status. Try again or leave without saving.")
                }
            }
        }
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
        if (!_state.value.isDone) loadCurrentMessages()
    }
}
