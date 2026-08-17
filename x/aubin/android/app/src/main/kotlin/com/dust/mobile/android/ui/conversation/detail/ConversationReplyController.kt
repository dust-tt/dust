package com.dust.mobile.android.ui.conversation.detail

import android.util.Log
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.ui.composer.AttachmentUploadController
import com.dust.mobile.android.ui.composer.KnowledgeSearchController
import com.dust.mobile.android.ui.composer.MESSAGE_SEND_LOG_TAG
import com.dust.mobile.android.ui.composer.MESSAGE_SEND_TIMEOUT_MS
import com.dust.mobile.android.ui.composer.MESSAGE_SEND_TIMEOUT_NOTICE
import com.dust.mobile.android.ui.composer.SpeechInputHandler
import com.dust.mobile.android.ui.composer.SpeechInputState
import com.dust.mobile.android.ui.composer.messageSendError
import com.dust.mobile.android.ui.composer.restoredReplyDraft
import com.dust.mobile.android.ui.composer.textWithAppendedTranscript
import com.dust.mobile.android.ui.preview.localPreviewReplyMessages
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.removeActiveAgentMentionQuery
import com.dust.mobile.core.model.removeActiveSkillSlashQuery
import com.dust.mobile.core.repository.ConversationAction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.UUID

internal class ConversationReplyController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean,
    private val workspaceId: String,
    private val conversation: Conversation,
    private val user: User,
    state: MutableStateFlow<ConversationDetailState>,
    coroutineScope: CoroutineScope,
    private val messageStore: ConversationMessageStore,
    private val reload: () -> Unit,
) {
    private val _state = state
    private val viewModelScope = coroutineScope
    private val speechInput = SpeechInputHandler(
        graph,
        tokenProvider,
        workspaceId,
        viewModelScope,
        isLocalPreview,
    )
    val speechState: StateFlow<SpeechInputState> = speechInput.state
    private val attachmentUploads = AttachmentUploadController(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        isLocalPreview = isLocalPreview,
        coroutineScope = viewModelScope,
        currentAttachments = { _state.value.attachments },
        updateAttachments = { transform ->
            _state.update { it.copy(attachments = transform(it.attachments)) }
        },
    )
    private val knowledgeSearch = KnowledgeSearchController(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        isLocalPreview = isLocalPreview,
        coroutineScope = viewModelScope,
    )
    private val optionsLoader = ConversationReplyOptionsLoader(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        isLocalPreview = isLocalPreview,
        coroutineScope = viewModelScope,
        state = _state,
    )
    private val outbox = ReplyOutboxController(
        graph = graph,
        state = _state,
        coroutineScope = viewModelScope,
        messageStore = messageStore,
        reload = reload,
    )

    fun updateReply(text: String) {
        _state.update { it.copy(replyText = text) }
    }

    fun selectReplyAgent(agent: LightAgentConfiguration) {
        _state.update {
            it.copy(
                replyText = removeActiveAgentMentionQuery(it.replyText),
                selectedReplyAgent = agent,
            )
        }
    }

    fun toggleReplyCapability(capability: Capability) {
        val action = if (_state.value.selectedCapabilities.any { it.id == capability.id }) {
            ConversationAction.DELETE
        } else {
            ConversationAction.ADD
        }
        _state.update { state ->
            val next = if (action == ConversationAction.DELETE) {
                state.selectedCapabilities.filterNot { it.id == capability.id }
            } else {
                state.selectedCapabilities + capability
            }
            state.copy(selectedCapabilities = next, actionError = null)
        }

        val tool = capability as? Capability.Tool ?: return
        if (isLocalPreview) return
        viewModelScope.launch {
            runCatching {
                graph.capabilityRepository.updateTool(
                    action = action,
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    mcpServerViewId = tool.serverView.sId,
                    tokenProvider = tokenProvider,
                )
            }.onFailure { error ->
                _state.update { it.copy(actionError = error.message ?: "Failed to sync tool selection") }
            }
        }
    }

    fun selectReplySlashSkill(capability: Capability.SkillCapability) {
        _state.update { state ->
            val text = removeActiveSkillSlashQuery(state.replyText)
            state.copy(
                replyText = text,
                selectedCapabilities = if (state.selectedCapabilities.any { it.id == capability.id }) {
                    state.selectedCapabilities
                } else {
                    state.selectedCapabilities + capability
                },
            )
        }
    }

    fun updateReplyKnowledgeQuery(query: String) {
        _state.update { it.copy(knowledgeQuery = query) }
        knowledgeSearch.search(
            query = query,
            onSearchingChanged = { searching ->
                _state.update { it.copy(isSearchingKnowledge = searching) }
            },
            onResults = { results ->
                _state.update { it.copy(knowledgeResults = results) }
            },
            onError = { message ->
                _state.update { it.copy(actionError = message) }
            },
        )
    }

    fun toggleReplyKnowledgeItem(item: KnowledgeItem) {
        _state.update { state ->
            val selected = state.selectedKnowledgeItems
            val next = if (selected.any { it.id == item.id }) {
                selected.filterNot { it.id == item.id }
            } else {
                selected + item
            }
            state.copy(selectedKnowledgeItems = next)
        }
    }

    fun addAttachment(fileName: String, contentType: String, data: ByteArray, thumbnailData: ByteArray? = null) {
        attachmentUploads.add(fileName, contentType, data, thumbnailData)
    }

    fun removeAttachment(id: String) {
        attachmentUploads.remove(id)
    }

    fun cancelAttachmentUploads() {
        attachmentUploads.cancel()
    }

    fun startVoiceInput() {
        val existingText = _state.value.replyText
        speechInput.start { transcript ->
            _state.update { state ->
                state.copy(replyText = textWithAppendedTranscript(existingText, transcript))
            }
        }
    }

    fun stopVoiceInput() {
        speechInput.stop()
    }

    fun cancelVoiceInput() {
        speechInput.cancel()
    }

    fun denyVoiceInput() {
        speechInput.setError("Microphone permission denied")
    }

    fun sendReply() {
        val state = _state.value
        val sentDraft = state.replyText
        val text = state.replyText.trim()
        if (!state.canSendReply) return
        if (text.isNotEmpty()) {
            messageStore.addOptimisticUserMessage(text)
        }
        _state.update { it.copy(replyText = "", isSending = true, error = null) }
        if (isLocalPreview) {
            viewModelScope.launch {
                delay(350)
                messageStore.removeOptimisticUserMessage()
                val nextRank = (_state.value.messages.maxOfOrNull { it.rank } ?: 0) + 1
                val previewMessages = localPreviewReplyMessages(
                    text = text,
                    user = user,
                    startRank = nextRank,
                    conversationId = conversation.sId,
                )
                _state.update { detailState ->
                    detailState.withMessages(detailState.messages + previewMessages).copy(
                        selectedCapabilities = emptyList(),
                        selectedKnowledgeItems = emptyList(),
                        knowledgeQuery = "",
                        knowledgeResults = emptyList(),
                        isSearchingKnowledge = false,
                        attachments = emptyList(),
                        isSending = false,
                    )
                }
            }
            return
        }
        viewModelScope.launch {
            Log.d(MESSAGE_SEND_LOG_TAG, "Reply preparing")
            val uploaded = try {
                withTimeout(MESSAGE_SEND_TIMEOUT_MS) {
                    attachmentUploads.awaitUploaded()
                }
            } catch (error: TimeoutCancellationException) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Reply attachment upload timed out", error)
                messageStore.removeOptimisticUserMessage()
                _state.update {
                    it.copy(
                        replyText = restoredReplyDraft(sentDraft, it.replyText),
                        isSending = false,
                        error = MESSAGE_SEND_TIMEOUT_NOTICE,
                    )
                }
                return@launch
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Reply failed", error)
                messageStore.removeOptimisticUserMessage()
                _state.update {
                    it.copy(
                        replyText = restoredReplyDraft(sentDraft, it.replyText),
                        isSending = false,
                        error = messageSendError(error, "Failed to send reply"),
                    )
                }
                return@launch
            }

            val clientRequestId = UUID.randomUUID().toString()
            val outboxItem = buildReplyOutboxItem(
                clientRequestId = clientRequestId,
                workspaceId = workspaceId,
                conversationId = conversation.sId,
                sentDraft = sentDraft,
                text = text,
                state = state,
                uploadedAttachments = uploaded,
                user = user,
            )
            _state.update {
                it.copy(
                    isSending = true,
                    pendingOutboxId = clientRequestId,
                    error = null,
                )
            }
            Log.d(MESSAGE_SEND_LOG_TAG, "Reply dispatching")
            val queued = try {
                withTimeout(MESSAGE_SEND_TIMEOUT_MS) {
                    graph.outboxRepository.enqueueAndSend(outboxItem, tokenProvider)
                }
            } catch (error: TimeoutCancellationException) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Reply queued after timeout", error)
                _state.update {
                    it.copy(isSending = false, error = REPLY_QUEUED_SEND_NOTICE)
                }
                observeOutbox(outboxItem)
                return@launch
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Reply queue failed", error)
                messageStore.removeOptimisticUserMessage()
                _state.update {
                    it.copy(
                        replyText = restoredReplyDraft(sentDraft, it.replyText),
                        isSending = false,
                        pendingOutboxId = null,
                        error = messageSendError(error, "Failed to queue reply"),
                    )
                }
                return@launch
            }
            outbox.apply(queued)
            if (queued.status == PersistedOutboxStatus.PENDING) {
                observeOutbox(queued)
            }
        }
    }

    fun observeOutbox(item: PersistedOutboxItem) {
        outbox.observe(item)
    }

    fun loadOptions(messages: List<ConversationMessage>) {
        optionsLoader.load(messages)
    }

    fun clear() {
        knowledgeSearch.cancel()
        cancelAttachmentUploads()
        speechInput.cancel()
        outbox.clear()
    }
}
