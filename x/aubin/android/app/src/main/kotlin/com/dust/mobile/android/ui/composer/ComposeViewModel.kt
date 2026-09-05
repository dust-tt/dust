package com.dust.mobile.android.ui.composer

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.ui.preview.localPreviewConversationFromDraft
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.CreateMessagePayload
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.contentWithSkillTags
import com.dust.mobile.core.model.removeActiveSkillSlashQuery
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.UUID

class ComposeViewModel(
    val graph: AppGraph,
    val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    val workspaceId: String,
    private val user: User,
    private val spaceId: String? = null,
) : ViewModel() {
    private val importedShareIds = mutableSetOf<Long>()
    private val _state = MutableStateFlow(ComposeState())
    val state: StateFlow<ComposeState> = _state.asStateFlow()
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
    private val optionsLoader = ComposeOptionsLoader(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        isLocalPreview = isLocalPreview,
        coroutineScope = viewModelScope,
        state = _state,
    )
    private val durability = ComposeDurabilityController(
        graph = graph,
        tokenProvider = tokenProvider,
        workspaceId = workspaceId,
        spaceId = spaceId,
        state = _state,
        coroutineScope = viewModelScope,
        knowledgeSearch = knowledgeSearch,
    )
    private val agentShortcuts = ComposeAgentShortcutController(
        graph = graph,
        workspaceId = workspaceId,
        state = _state,
        coroutineScope = viewModelScope,
    )

    init {
        optionsLoader.load()
        durability.start()
    }

    fun updateText(text: String) {
        _state.update { it.copy(text = text) }
    }

    fun selectAgent(agent: LightAgentConfiguration) = agentShortcuts.select(agent)

    suspend fun preferAgent(agentId: String?, shortcutId: String?) =
        agentShortcuts.prefer(agentId, shortcutId)

    fun toggleCapability(capability: Capability) {
        _state.update { state ->
            val selected = state.selectedCapabilities
            val next = if (selected.any { it.id == capability.id }) {
                selected.filterNot { it.id == capability.id }
            } else {
                selected + capability
            }
            state.copy(selectedCapabilities = next)
        }
    }

    fun selectSlashSkill(capability: Capability.SkillCapability) {
        _state.update { state ->
            val text = removeActiveSkillSlashQuery(state.text)
            state.copy(
                text = text,
                selectedCapabilities = if (state.selectedCapabilities.any { it.id == capability.id }) {
                    state.selectedCapabilities
                } else {
                    state.selectedCapabilities + capability
                },
            )
        }
    }

    fun updateKnowledgeQuery(query: String) {
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
                _state.update { it.copy(error = message) }
            },
        )
    }

    fun toggleKnowledgeItem(item: KnowledgeItem) {
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

    fun importSharedContent(
        shareId: Long,
        text: String?,
        files: List<PickedFile>,
        failedFileCount: Int,
    ) {
        if (!importedShareIds.add(shareId)) return
        _state.update { state ->
            state.copy(
                text = appendSharedText(state.text, text),
                error = if (failedFileCount > 0) {
                    if (failedFileCount == 1) "A shared file could not be opened" else "$failedFileCount shared files could not be opened"
                } else {
                    state.error
                },
            )
        }
        files.forEach { file ->
            addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        }
    }

    fun removeAttachment(id: String) {
        attachmentUploads.remove(id)
    }

    fun cancelAttachmentUploads() {
        attachmentUploads.cancel()
    }

    fun discardDraft() {
        if (_state.value.pendingOutboxId != null) return
        knowledgeSearch.cancel()
        cancelAttachmentUploads()
        speechInput.cancel()
        _state.update { it.clearedDraft() }
        durability.discardPersistedDraft()
    }

    fun startVoiceInput() {
        val existingText = _state.value.text
        speechInput.start { transcript ->
            _state.update { state ->
                state.copy(text = textWithAppendedTranscript(existingText, transcript))
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

    fun send() {
        val sendState = _state.value
        val text = sendState.text.trim()
        if (!sendState.canSend) return
        val selectedAgentId = sendState.selectedAgent?.sId ?: DEFAULT_AGENT_CONFIGURATION_ID
        sendState.selectedAgent?.let(agentShortcuts::record)
        val selectedCapabilities = sendState.selectedCapabilities
        val selectedKnowledgeItems = sendState.selectedKnowledgeItems
        if (isLocalPreview) {
            viewModelScope.launch {
                _state.update { it.copy(isSending = true, error = null) }
                delay(350)
                knowledgeSearch.cancel()
                _state.update {
                    it.sentSuccessfully().copy(
                        createdConversation = localPreviewConversationFromDraft(text = text),
                    )
                }
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSending = true, error = null) }
            Log.d(MESSAGE_SEND_LOG_TAG, "Conversation preparing")
            val uploadedAttachments = try {
                withTimeout(MESSAGE_SEND_TIMEOUT_MS) {
                    attachmentUploads.awaitUploaded()
                }
            } catch (error: TimeoutCancellationException) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Attachment upload timed out", error)
                _state.update { it.copy(isSending = false, error = MESSAGE_SEND_TIMEOUT_NOTICE) }
                return@launch
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Conversation failed", error)
                _state.update { it.copy(isSending = false, error = messageSendError(error, "Failed to send message")) }
                return@launch
            }

            val clientRequestId = UUID.randomUUID().toString()
            val context = ContentFragmentContext(profilePictureUrl = user.profilePictureUrl)
            val request = CreateConversationRequest(
                spaceId = spaceId,
                message = CreateMessagePayload(
                    content = contentWithSkillTags(text, selectedCapabilities),
                    mentions = listOf(MentionPayload(selectedAgentId)),
                    context = buildMessageContext(selectedCapabilities, user.profilePictureUrl),
                ),
                contentFragments = uploadedAttachments.map {
                    ContentFragmentPayload.file(it.fileName, it.fileId, context)
                } + selectedKnowledgeItems.map {
                    ContentFragmentPayload.node(
                        title = it.title,
                        nodeId = it.internalId,
                        nodeDataSourceViewId = it.dataSourceViewId,
                        context = context,
                    )
                },
            )
            val outboxItem = PersistedOutboxItem(
                id = clientRequestId,
                kind = PersistedOutboxKind.CREATE_CONVERSATION,
                workspaceId = workspaceId,
                createRequest = request,
                createdAtEpochMillis = System.currentTimeMillis(),
            )
            _state.update {
                it.copy(
                    isSending = true,
                    pendingOutboxId = clientRequestId,
                    error = null,
                )
            }
            Log.d(MESSAGE_SEND_LOG_TAG, "Conversation dispatching")
            val queued = try {
                withTimeout(MESSAGE_SEND_TIMEOUT_MS) {
                    graph.outboxRepository.enqueueAndSend(outboxItem, tokenProvider)
                }
            } catch (error: TimeoutCancellationException) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Conversation queued after timeout", error)
                _state.update {
                    it.copy(
                        isSending = false,
                        error = QUEUED_SEND_NOTICE,
                    )
                }
                durability.observeOutbox(clientRequestId)
                return@launch
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(MESSAGE_SEND_LOG_TAG, "Conversation queue failed", error)
                _state.update {
                    it.copy(
                        isSending = false,
                        pendingOutboxId = null,
                        error = messageSendError(error, "Failed to queue message"),
                    )
                }
                return@launch
            }
            durability.applyOutboxState(queued)
            if (queued.status == PersistedOutboxStatus.PENDING) {
                durability.observeOutbox(clientRequestId)
            }
        }
    }

    fun consumeCreatedConversation() {
        _state.update { it.copy(createdConversation = null) }
    }

    override fun onCleared() {
        knowledgeSearch.cancel()
        cancelAttachmentUploads()
        speechInput.cancel()
        durability.clear()
        super.onCleared()
    }

}
