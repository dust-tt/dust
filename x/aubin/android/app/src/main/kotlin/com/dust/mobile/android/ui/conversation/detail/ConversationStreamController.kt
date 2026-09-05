package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.AgentMessageDoneEventData
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationEventData
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.canRespondToBlockedAction
import com.dust.mobile.core.model.nextBlockedActionStreamMessageId
import com.dust.mobile.core.model.reconciledBlockedState
import com.dust.mobile.core.model.toBlockedState
import com.dust.mobile.core.stream.AgentMessageStream
import com.dust.mobile.core.stream.StreamEventCursor
import com.dust.mobile.core.stream.StreamingEventParser
import com.dust.mobile.core.stream.StreamingReconnect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal class ConversationStreamController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean,
    private val workspaceId: String,
    private val conversation: Conversation,
    private val currentUserSId: String?,
    state: MutableStateFlow<ConversationDetailState>,
    coroutineScope: CoroutineScope,
    private val messageStore: ConversationMessageStore,
    private val reload: () -> Unit,
) {
    private val _state = state
    private val viewModelScope = coroutineScope
    private var streamJob: Job? = null
    private val conversationEvents = ConversationEventsController(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        conversation = conversation,
        coroutineScope = viewModelScope,
        onEvent = ::handleConversationEvent,
    )

    fun resyncOnForeground() {
        if (_state.value.blockedState == null) return
        viewModelScope.launch {
            if (refreshBlockedActions()) {
                reload()
            }
        }
    }

    fun startConversationEvents() {
        if (isLocalPreview) return
        conversationEvents.start()
    }

    private suspend fun handleConversationEvent(event: ConversationEventData) {
        when (event) {
            is ConversationEventData.AgentMessageNew -> {
                val message = ConversationMessage.Agent(event.event.message)
                messageStore.insertMessageIfNew(message)
                if (event.event.message.isStreaming) {
                    attachToStreamingMessage(listOf(message))
                }
            }
            is ConversationEventData.AgentMessageDone -> handleAgentMessageDone(event.event)
            is ConversationEventData.UserMessageNew -> {
                messageStore.removeOptimisticUserMessage()
                messageStore.insertMessageIfNew(ConversationMessage.User(event.event.message))
            }
            is ConversationEventData.UserMessagePromoted -> messageStore.promoteUserMessage(event.event.messageId)
            is ConversationEventData.ConversationTitle ->
                _state.update { it.copy(conversationTitle = event.event.title) }
            is ConversationEventData.Unknown -> Unit
        }
    }

    private suspend fun handleAgentMessageDone(event: AgentMessageDoneEventData) {
        if (!_state.value.shouldHandleAgentMessageDone(event.messageId)) return
        val wasCurrentStream = _state.value.streamingMessageId == event.messageId
        if (wasCurrentStream) {
            streamJob?.cancel()
            streamJob = null
        }
        messageStore.updateAgentMessageStatus(event.messageId, event.status)
        runCatching {
            graph.conversationRepository.fetchMessage(
                workspaceId = workspaceId,
                conversationId = event.conversationId,
                messageId = event.messageId,
                tokenProvider = tokenProvider,
            )
        }.onSuccess { message ->
            messageStore.upsertMessage(message)
        }
        if (wasCurrentStream) {
            _state.update { it.withClearedLiveStream() }
        }
    }

    fun attachToStreamingMessage(messages: List<ConversationMessage>) {
        val messageId = messages
            .filterIsInstance<ConversationMessage.Agent>()
            .lastOrNull { it.message.isStreaming }
            ?.message
            ?.sId
            ?: return
        startMessageStream(messageId)
    }

    private fun startMessageStream(messageId: String) {
        if (isLocalPreview) return
        if (_state.value.streamingMessageId == messageId && streamJob?.isActive == true) return

        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            val reducer = AgentMessageStream(messageId)
            val cursor = StreamEventCursor()
            var retryDelayMs = StreamingReconnect.INITIAL_RETRY_DELAY_MS
            var isTerminated = false
            _state.update {
                it.copy(
                    blockedState = null,
                    actionError = null,
                    streamingMessageId = messageId,
                    inlineActivities = it.inlineActivities + (messageId to InlineActivityState()),
                )
            }

            while (isActive && !isTerminated) {
                var didProcessEvent = false
                var shouldBackOff = false
                runCatching {
                    graph.sseClient.eventStream(
                        endpoint = Endpoints.messageEvents(workspaceId, conversation.sId, messageId),
                        tokenProvider = tokenProvider,
                        lastEventId = cursor.lastEventId,
                    ).collect { payload ->
                        if (isTerminated) return@collect
                        val envelope = runCatching {
                            StreamingEventParser.parseMessageEvent(payload)
                        }.getOrElse {
                            return@collect
                        }
                        if (!cursor.shouldProcess(envelope.eventId)) return@collect
                        retryDelayMs = StreamingReconnect.INITIAL_RETRY_DELAY_MS
                        didProcessEvent = true
                        val event = envelope.data
                        val blocked = event.toBlockedState(
                            messageId = messageId,
                            fallbackConversationId = conversation.sId,
                        )
                        if (blocked != null) {
                            _state.update { it.copy(blockedState = blocked, actionError = null) }
                        } else {
                            reducer.apply(event)
                            applyStreamSnapshot(messageId, reducer.snapshot)
                            if (reducer.snapshot.isFinished) {
                                _state.update { it.withClearedLiveStream() }
                                isTerminated = true
                            }
                        }
                    }
                }.onFailure {
                    if (!isActive) return@launch
                    shouldBackOff = true
                }

                if (!isActive || isTerminated) break

                if (!shouldBackOff && !didProcessEvent) {
                    isTerminated = refreshMessageIfTerminal(messageId)
                    shouldBackOff = !isTerminated
                }

                if (!isTerminated) {
                    val reconnectDelay = StreamingReconnect.nextDelay(shouldBackOff, retryDelayMs)
                    retryDelayMs = reconnectDelay.nextRetryDelayMs
                    delay(reconnectDelay.delayMs)
                }
            }
        }
    }

    private suspend fun refreshMessageIfTerminal(messageId: String): Boolean {
        val message = runCatching {
            graph.conversationRepository.fetchMessage(
                workspaceId = workspaceId,
                conversationId = conversation.sId,
                messageId = messageId,
                tokenProvider = tokenProvider,
            )
        }.getOrElse {
            return false
        }

        messageStore.upsertMessage(message)
        val agent = (message as? ConversationMessage.Agent)?.message ?: return false
        if (agent.isStreaming) return false
        _state.update { it.withClearedLiveStream() }
        return true
    }

    private fun applyStreamSnapshot(messageId: String, snapshot: AgentMessageStream.Snapshot) {
        _state.update { state -> state.withAppliedStreamSnapshot(messageId, snapshot) }
    }

    fun validateAction(approval: ActionApproval) {
        val info = (_state.value.blockedState as? BlockedState.Approval)?.approval ?: return
        if (_state.value.isValidatingAction || !canRespondToBlockedAction(info.triggeringUserId, currentUserSId)) return
        _state.update { it.copy(isValidatingAction = true, actionError = null) }
        viewModelScope.launch {
            runCatching {
                graph.conversationRepository.validateAction(
                    workspaceId = workspaceId,
                    conversationId = info.conversationId,
                    messageId = info.messageId,
                    actionId = info.actionId,
                    approved = approval,
                    tokenProvider = tokenProvider,
                )
            }.onSuccess {
                _state.update { it.copy(blockedState = null, isValidatingAction = false) }
                restartMessageStream(info.messageId)
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isValidatingAction = false,
                        actionError = error.message ?: "Failed to validate action",
                    )
                }
            }
        }
    }

    fun answerQuestion(answer: UserQuestionAnswer) {
        val info = (_state.value.blockedState as? BlockedState.UserQuestionRequired)?.question ?: return
        if (_state.value.isValidatingAction || !canRespondToBlockedAction(info.triggeringUserId, currentUserSId)) return
        _state.update { it.copy(isValidatingAction = true, actionError = null) }
        viewModelScope.launch {
            runCatching {
                graph.conversationRepository.answerQuestion(
                    workspaceId = workspaceId,
                    conversationId = info.conversationId,
                    messageId = info.messageId,
                    actionId = info.actionId,
                    answer = answer,
                    tokenProvider = tokenProvider,
                )
            }.onSuccess {
                _state.update { it.copy(blockedState = null, isValidatingAction = false) }
                restartMessageStream(info.messageId)
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isValidatingAction = false,
                        actionError = error.message ?: "Failed to answer question",
                    )
                }
            }
        }
    }

    fun retryMessage(messageId: String) {
        viewModelScope.launch {
            _state.update { it.copy(lastError = null, actionError = null) }
            runCatching {
                graph.conversationRepository.retryMessage(workspaceId, conversation.sId, messageId, tokenProvider)
            }.onSuccess {
                restartMessageStream(messageId)
            }.onFailure { error ->
                _state.update { it.copy(actionError = error.message ?: "Failed to retry message") }
            }
        }
    }

    fun reconcileBlockedActions() {
        viewModelScope.launch {
            refreshBlockedActions()
        }
    }

    private suspend fun refreshBlockedActions(): Boolean {
        return runCatching {
            graph.conversationRepository.fetchBlockedActions(workspaceId, conversation.sId, tokenProvider)
        }.map { actions ->
            val action = actions.firstOrNull()
            if (action == null) {
                clearResolvedBlockedState()
                true
            } else {
                nextBlockedActionStreamMessageId(
                    currentStreamingMessageId = _state.value.streamingMessageId,
                    blockedActionMessageId = action.messageId,
                )?.let(::restartMessageStream)
                _state.update {
                    it.copy(
                        blockedState = reconciledBlockedState(
                            currentBlockedState = it.blockedState,
                            blockedAction = action,
                            fallbackConversationId = conversation.sId,
                        ),
                    )
                }
                false
            }
        }.getOrElse {
            false
        }
    }

    private fun clearResolvedBlockedState() {
        if (_state.value.blockedState == null) {
            _state.update { it.copy(blockedState = null) }
            return
        }

        streamJob?.cancel()
        streamJob = null
        _state.update { it.withClearedLiveStream() }
    }

    private fun restartMessageStream(messageId: String) {
        startMessageStream(messageId)
    }

    fun clear() {
        streamJob?.cancel()
        conversationEvents.clear()
    }
}
