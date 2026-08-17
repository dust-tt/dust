package com.dust.mobile.android.ui.conversation.detail

import android.util.Log
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.ui.composer.MESSAGE_SEND_LOG_TAG
import com.dust.mobile.android.ui.composer.restoredReplyDraft
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ReplyOutboxController(
    private val graph: AppGraph,
    private val state: MutableStateFlow<ConversationDetailState>,
    private val coroutineScope: CoroutineScope,
    private val messageStore: ConversationMessageStore,
    private val reload: () -> Unit,
) {
    private var observationJob: Job? = null

    fun observe(item: PersistedOutboxItem) {
        if (observationJob?.isActive == true && state.value.pendingOutboxId == item.id) return
        if (item.displayText?.isNotBlank() == true && state.value.pendingOutboxId != item.id) {
            messageStore.addOptimisticUserMessage(item.displayText)
            state.update { it.copy(replyText = "", pendingOutboxId = item.id) }
        }
        observationJob?.cancel()
        observationJob = coroutineScope.launch {
            graph.outboxRepository.observe(item.id).collect { current ->
                current?.let { apply(it) }
            }
        }
    }

    suspend fun apply(item: PersistedOutboxItem) {
        when (item.status) {
            PersistedOutboxStatus.PENDING -> state.update {
                it.copy(isSending = false, pendingOutboxId = item.id, error = REPLY_QUEUED_SEND_NOTICE)
            }
            PersistedOutboxStatus.SENDING -> state.update {
                it.copy(isSending = true, pendingOutboxId = item.id, error = null)
            }
            PersistedOutboxStatus.FAILED -> finishFailed(item)
            PersistedOutboxStatus.SENT -> finishSent(item)
        }
    }

    fun clear() {
        observationJob?.cancel()
    }

    private suspend fun finishFailed(item: PersistedOutboxItem) {
        messageStore.removeOptimisticUserMessage()
        state.update {
            it.copy(
                replyText = restoredReplyDraft(item.displayText.orEmpty(), it.replyText),
                isSending = false,
                pendingOutboxId = null,
                error = item.lastError ?: "Failed to send reply",
            )
        }
        graph.outboxRepository.acknowledge(item.id)
    }

    private suspend fun finishSent(item: PersistedOutboxItem) {
        Log.d(MESSAGE_SEND_LOG_TAG, "Reply accepted")
        messageStore.removeOptimisticUserMessage()
        state.update {
            it.copy(
                selectedCapabilities = emptyList(),
                selectedKnowledgeItems = emptyList(),
                knowledgeQuery = "",
                knowledgeResults = emptyList(),
                isSearchingKnowledge = false,
                attachments = emptyList(),
                isSending = false,
                pendingOutboxId = null,
                error = null,
            )
        }
        graph.outboxRepository.acknowledge(item.id)
        reload()
    }
}

internal const val REPLY_QUEUED_SEND_NOTICE = "Queued. Dust will send this when the connection is ready."
