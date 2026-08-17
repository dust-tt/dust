package com.dust.mobile.android.ui.conversation.detail

import android.util.LruCache
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedDraft
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.data.persistence.replyDraftKey
import com.dust.mobile.android.ui.composer.SpeechInputState
import com.dust.mobile.android.ui.preview.localPreviewAgents
import com.dust.mobile.android.ui.preview.localPreviewCapabilities
import com.dust.mobile.android.ui.preview.localPreviewCompletedSteps
import com.dust.mobile.android.ui.preview.localPreviewMessages
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserQuestionAnswer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ConversationDetailViewModel(
    val graph: AppGraph,
    val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    val workspaceId: String,
    private val conversation: Conversation,
    private val user: User,
    private val currentUserSId: String?,
) : ViewModel() {
    private val draftKey = replyDraftKey(workspaceId, conversation.sId)
    private val _state = MutableStateFlow(ConversationDetailState(conversationTitle = conversation.title))
    val state: StateFlow<ConversationDetailState> = _state.asStateFlow()
    private val messageStore = ConversationMessageStore(_state, user)
    private val replyController = ConversationReplyController(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspaceId,
        conversation = conversation,
        user = user,
        state = _state,
        coroutineScope = viewModelScope,
        messageStore = messageStore,
        reload = ::load,
    )
    private val voiceSessionController = ConversationVoiceSessionController(
        appContext = graph.appContext,
        detailState = _state,
        speechState = replyController.speechState,
        coroutineScope = viewModelScope,
        startSpeechInput = replyController::startVoiceInput,
        stopSpeechInput = replyController::stopVoiceInput,
        cancelSpeechInput = replyController::cancelVoiceInput,
        sendReply = replyController::sendReply,
    )
    private val streamController = ConversationStreamController(
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspaceId,
        conversation = conversation,
        currentUserSId = currentUserSId,
        state = _state,
        coroutineScope = viewModelScope,
        messageStore = messageStore,
        reload = ::load,
    )
    val speechState: StateFlow<SpeechInputState> = replyController.speechState
    internal val voiceSessionState: StateFlow<ConversationVoiceSessionState> = voiceSessionController.state
    private val contentFragmentImageCache = object : LruCache<String, ByteArray>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }
    private val offlineCache = ConversationOfflineCacheController(
        graph = graph,
        activeUser = user,
        workspaceId = workspaceId,
        conversationId = conversation.sId,
        state = _state,
        coroutineScope = viewModelScope,
        isLocalPreview = isLocalPreview,
    )

    init {
        restoreAndPersistDraft()
        offlineCache.startPersisting()
    }

    suspend fun loadContentFragmentImage(fileId: String): ByteArray? {
        contentFragmentImageCache[fileId]?.let { return it }
        if (isLocalPreview) return null
        return runCatching {
            withContext(Dispatchers.IO) {
                graph.fileRepository.fetchFileData(workspaceId, fileId, tokenProvider)
            }
        }.getOrNull()?.also { contentFragmentImageCache.put(fileId, it) }
    }

    fun load() {
        if (isLocalPreview) {
            val messages = localPreviewMessages(conversation.sId)
            val agents = localPreviewAgents()
            val agentMessages = messages
                .filterIsInstance<ConversationMessage.Agent>()
            val streamingMessageId = agentMessages
                .lastOrNull { it.message.isStreaming }
                ?.id
            val activityMessageId = streamingMessageId ?: agentMessages.firstOrNull()?.id
            _state.value = ConversationDetailState(conversationTitle = conversation.title)
                .withMessages(messages)
                .copy(
                    isLoading = false,
                    agents = agents,
                    selectedReplyAgent = agents.firstOrNull(),
                    availableCapabilities = localPreviewCapabilities(workspaceId),
                    streamingMessageId = streamingMessageId,
                    inlineActivities = activityMessageId?.let { messageId ->
                        mapOf(
                            messageId to InlineActivityState(
                                activeActions = if (messageId == streamingMessageId) {
                                    listOf(
                                        ActiveAction(
                                            id = 1,
                                            label = "Reading launch updates",
                                            serverName = "Google Drive",
                                        ),
                                    )
                                } else {
                                    emptyList()
                                },
                                completedSteps = localPreviewCompletedSteps(),
                            ),
                        )
                    }.orEmpty(),
                )
            return
        }
        viewModelScope.launch {
            offlineCache.restore()
            _state.update { it.copy(isLoading = it.messages.isEmpty(), error = null, refreshError = null) }
            runCatching {
                graph.conversationRepository.fetchMessages(workspaceId, conversation.sId, tokenProvider)
            }.onSuccess { messages ->
                val sortedMessages = messages.messages.sortedByRank()
                _state.update { state ->
                    state.withMessages(sortedMessages).copy(
                        isLoading = false,
                        hasMore = messages.hasMore,
                        lastValue = messages.lastValue,
                        refreshError = null,
                        lastError = null,
                    )
                }
                streamController.attachToStreamingMessage(sortedMessages)
                replyController.loadOptions(sortedMessages)
                streamController.startConversationEvents()
                streamController.reconcileBlockedActions()
                markAsRead()
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = if (it.messages.isEmpty()) {
                            error.message ?: "Failed to load messages"
                        } else {
                            null
                        },
                        refreshError = SAVED_MESSAGES_NOTICE.takeIf { _ -> it.messages.isNotEmpty() },
                    )
                }
            }
        }
    }

    fun loadMore() {
        val lastValue = _state.value.lastValue ?: return
        if (!_state.value.hasMore || _state.value.isLoadingMore) return
        viewModelScope.launch {
            _state.update { it.copy(isLoadingMore = true, error = null) }
            runCatching {
                graph.conversationRepository.fetchMessages(
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    tokenProvider = tokenProvider,
                    lastValue = lastValue,
                )
            }.onSuccess { response ->
                _state.update { state ->
                    state.withMessages(
                        (state.messages + response.messages).distinctBy { it.id }.sortedByRank(),
                    ).copy(
                        hasMore = response.hasMore,
                        lastValue = response.lastValue,
                        isLoadingMore = false,
                        refreshError = null,
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isLoadingMore = false,
                        refreshError = error.message ?: "Failed to load more messages",
                    )
                }
            }
        }
    }

    fun updateReply(text: String) = replyController.updateReply(text)

    fun selectReplyAgent(agent: LightAgentConfiguration) = replyController.selectReplyAgent(agent)

    fun toggleReplyCapability(capability: Capability) = replyController.toggleReplyCapability(capability)

    fun selectReplySlashSkill(capability: Capability.SkillCapability) =
        replyController.selectReplySlashSkill(capability)

    fun updateReplyKnowledgeQuery(query: String) = replyController.updateReplyKnowledgeQuery(query)

    fun toggleReplyKnowledgeItem(item: KnowledgeItem) = replyController.toggleReplyKnowledgeItem(item)

    fun addAttachment(
        fileName: String,
        contentType: String,
        data: ByteArray,
        thumbnailData: ByteArray? = null,
    ) = replyController.addAttachment(fileName, contentType, data, thumbnailData)

    fun removeAttachment(id: String) = replyController.removeAttachment(id)

    fun cancelAttachmentUploads() = replyController.cancelAttachmentUploads()

    fun startVoiceInput() = voiceSessionController.startListening()

    fun stopVoiceInput() = voiceSessionController.stopListening()

    fun cancelVoiceInput() = voiceSessionController.endSession()

    fun denyVoiceInput() = voiceSessionController.permissionDenied()

    fun resyncOnForeground() = streamController.resyncOnForeground()

    fun sendReply() = replyController.sendReply()

    fun sendVoiceReply() = voiceSessionController.sendCurrentTurn()

    fun validateAction(approval: ActionApproval) = streamController.validateAction(approval)

    fun answerQuestion(answer: UserQuestionAnswer) = streamController.answerQuestion(answer)

    fun retryMessage(messageId: String) = streamController.retryMessage(messageId)

    override fun onCleared() {
        streamController.clear()
        voiceSessionController.clear()
        replyController.clear()
        super.onCleared()
    }

    private fun markAsRead() {
        if (!shouldMarkConversationAsReadOnOpen(conversation)) return
        if (isLocalPreview) return
        viewModelScope.launch {
            runCatching {
                graph.conversationRepository.markAsRead(workspaceId, conversation.sId, tokenProvider)
            }
        }
    }

    @OptIn(FlowPreview::class)
    private fun restoreAndPersistDraft() {
        viewModelScope.launch {
            val persistedState = graph.persistedStateStore.current()
            val storedDraft = persistedState.drafts[draftKey]
            val pendingItem = storedDraft?.pendingOutboxId?.let { outboxId ->
                persistedState.outbox.find { it.id == outboxId }
            } ?: persistedState.outbox.lastOrNull { item ->
                item.kind == PersistedOutboxKind.POST_MESSAGE &&
                    item.workspaceId == workspaceId &&
                    item.conversationId == conversation.sId &&
                    item.status != PersistedOutboxStatus.SENT &&
                    item.status != PersistedOutboxStatus.FAILED
            }
            val restoredDraft = storedDraft?.copy(
                pendingOutboxId = pendingItem?.id,
            ) ?: pendingItem?.let { PersistedDraft(pendingOutboxId = it.id) }
            if (restoredDraft != null) {
                _state.update { it.restoreReplyDraftContent(restoredDraft) }
                pendingItem?.let(replyController::observeOutbox)
                _state.filter { state -> state.agents.isNotEmpty() || state.error != null }.first()
                _state.update { it.restoreReplyDraftSelections(restoredDraft) }
            }

            _state
                .map(ConversationDetailState::toPersistedReplyDraft)
                .distinctUntilChanged()
                .debounce(DRAFT_SAVE_DEBOUNCE_MS)
                .collect { draft ->
                    graph.persistedStateStore.update { state ->
                        state.copy(drafts = state.drafts + (draftKey to draft))
                    }
                }
        }
    }

    private companion object {
        const val DRAFT_SAVE_DEBOUNCE_MS = 150L
        const val SAVED_MESSAGES_NOTICE = "Could not refresh. Showing saved messages."
    }
}
