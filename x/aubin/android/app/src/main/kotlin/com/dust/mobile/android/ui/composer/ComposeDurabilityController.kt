package com.dust.mobile.android.ui.composer

import android.util.Log
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedDraft
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.data.persistence.composeDraftKey
import com.dust.mobile.core.auth.TokenProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ComposeDurabilityController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val spaceId: String?,
    private val state: MutableStateFlow<ComposeState>,
    private val coroutineScope: CoroutineScope,
    private val knowledgeSearch: KnowledgeSearchController,
) {
    private val draftKey = composeDraftKey(workspaceId, spaceId)
    private var outboxObservationJob: Job? = null

    @OptIn(FlowPreview::class)
    fun start() {
        coroutineScope.launch {
            val persistedState = graph.persistedStateStore.current()
            val storedDraft = persistedState.drafts[draftKey]
            val pendingItem = storedDraft?.pendingOutboxId?.let { outboxId ->
                persistedState.outbox.find { it.id == outboxId }
            } ?: persistedState.outbox.lastOrNull { item ->
                item.kind == PersistedOutboxKind.CREATE_CONVERSATION &&
                    item.workspaceId == workspaceId &&
                    item.createRequest?.spaceId == spaceId &&
                    item.status != PersistedOutboxStatus.SENT &&
                    item.status != PersistedOutboxStatus.FAILED
            }
            val restoredDraft = storedDraft?.copy(
                pendingOutboxId = pendingItem?.id,
            ) ?: pendingItem?.let { PersistedDraft(pendingOutboxId = it.id) }
            if (restoredDraft != null) {
                state.update { it.restoreDraftContent(restoredDraft) }
                state.filter { current ->
                    !current.isLoadingOptions && (current.agents.isNotEmpty() || current.error != null)
                }.first()
                state.update { it.restoreDraftSelections(restoredDraft) }
                pendingItem?.let { applyOutboxState(it) }
                if (pendingItem?.status == PersistedOutboxStatus.PENDING ||
                    pendingItem?.status == PersistedOutboxStatus.SENDING
                ) {
                    observeOutbox(pendingItem.id)
                }
            }
            state.update { it.copy(isDraftRestored = true) }

            state
                .map(ComposeState::toPersistedDraft)
                .distinctUntilChanged()
                .debounce(DRAFT_SAVE_DEBOUNCE_MS)
                .collect { draft ->
                    graph.persistedStateStore.update { persisted ->
                        persisted.copy(drafts = persisted.drafts + (draftKey to draft))
                    }
                }
        }
    }

    fun observeOutbox(id: String) {
        if (outboxObservationJob?.isActive == true && state.value.pendingOutboxId == id) return
        outboxObservationJob?.cancel()
        outboxObservationJob = coroutineScope.launch {
            graph.outboxRepository.observe(id).collect { item ->
                item?.let { applyOutboxState(it) }
            }
        }
    }

    suspend fun applyOutboxState(item: PersistedOutboxItem) {
        when (item.status) {
            PersistedOutboxStatus.PENDING -> state.update {
                it.copy(isSending = false, pendingOutboxId = item.id, error = QUEUED_SEND_NOTICE)
            }
            PersistedOutboxStatus.SENDING -> state.update {
                it.copy(isSending = true, pendingOutboxId = item.id, error = null)
            }
            PersistedOutboxStatus.FAILED -> {
                state.update {
                    it.copy(
                        isSending = false,
                        pendingOutboxId = null,
                        error = item.lastError ?: "Failed to send message",
                    )
                }
                graph.outboxRepository.acknowledge(item.id)
            }
            PersistedOutboxStatus.SENT -> finishSentConversation(item)
        }
    }

    fun discardPersistedDraft() {
        coroutineScope.launch {
            graph.persistedStateStore.update { persisted ->
                persisted.copy(drafts = persisted.drafts - draftKey)
            }
        }
    }

    fun clear() {
        outboxObservationJob?.cancel()
    }

    private suspend fun finishSentConversation(item: PersistedOutboxItem) {
        val conversationId = item.resultConversationId ?: return
        val conversation = try {
            graph.conversationRepository.fetchConversation(workspaceId, conversationId, tokenProvider)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            // The send succeeded. Open its destination even if the follow-up read is offline;
            // the conversation screen owns loading and retrying its content.
            item.sentConversationDestination() ?: return
        }
        Log.d(MESSAGE_SEND_LOG_TAG, "Conversation accepted")
        knowledgeSearch.cancel()
        state.update {
            it.sentSuccessfully().copy(createdConversation = conversation)
        }
        graph.persistedStateStore.update { persisted ->
            persisted.copy(drafts = persisted.drafts - draftKey)
        }
        graph.outboxRepository.acknowledge(item.id)
    }

    private companion object {
        const val DRAFT_SAVE_DEBOUNCE_MS = 150L
    }
}

internal const val QUEUED_SEND_NOTICE = "Queued. Dust will send this when the connection is ready."
