package com.dust.mobile.android.data.outbox

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.data.persistence.PersistedStateStore
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.replyAgentConfigurationId
import com.dust.mobile.core.network.ApiError
import com.dust.mobile.core.repository.ConversationRepository
import com.dust.mobile.core.repository.FileRepository
import com.dust.mobile.core.repository.UserRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal class OutboxRepository(
    context: Context,
    private val stateStore: PersistedStateStore,
    private val conversationRepository: ConversationRepository,
    private val fileRepository: FileRepository,
    private val userRepository: UserRepository,
) {
    private val workManager = WorkManager.getInstance(context)
    private val flushMutex = Mutex()

    val items: Flow<List<PersistedOutboxItem>> = stateStore.state.map { it.outbox }

    fun observe(id: String): Flow<PersistedOutboxItem?> =
        items.map { outbox -> outbox.find { it.id == id } }

    suspend fun enqueue(item: PersistedOutboxItem) {
        stateStore.update { state ->
            if (state.outbox.any { it.id == item.id }) {
                state
            } else {
                state.copy(outbox = (state.outbox + item).retainingUnacknowledgedMessages())
            }
        }
        schedule()
    }

    suspend fun enqueueAndSend(
        item: PersistedOutboxItem,
        tokenProvider: TokenProvider,
    ): PersistedOutboxItem {
        enqueue(item)
        flush(tokenProvider)
        return observe(item.id).first { queued -> queued?.status != PersistedOutboxStatus.SENDING }
            ?: error("Outbox item was removed before completion")
    }

    suspend fun retry(id: String) {
        updateItem(id) {
            it.copy(status = PersistedOutboxStatus.PENDING, lastError = null)
        }
        schedule()
    }

    suspend fun acknowledge(id: String) {
        stateStore.update { state -> state.copy(outbox = state.outbox.filterNot { it.id == id }) }
    }

    suspend fun flush(tokenProvider: TokenProvider): OutboxFlushResult = flushMutex.withLock {
        var item = stateStore.current().outbox.firstOrNull {
            it.status == PersistedOutboxStatus.PENDING || it.status == PersistedOutboxStatus.SENDING
        }
        while (item != null) {
            val currentItem = item
            updateItem(currentItem.id) {
                it.copy(
                    status = PersistedOutboxStatus.SENDING,
                    attemptCount = it.attemptCount + 1,
                    lastError = null,
                )
            }

            try {
                val result = send(currentItem, tokenProvider)
                updateItem(currentItem.id) {
                    it.copy(
                        status = PersistedOutboxStatus.SENT,
                        lastError = null,
                        resultConversationId = result.conversationId,
                        resultMessageId = result.messageId,
                    )
                }
            } catch (error: CancellationException) {
                updateItem(currentItem.id) { it.copy(status = PersistedOutboxStatus.PENDING) }
                throw error
            } catch (error: Throwable) {
                val permanent = error.isPermanentOutboxFailure()
                updateItem(currentItem.id) {
                    it.copy(
                        status = if (permanent) PersistedOutboxStatus.FAILED else PersistedOutboxStatus.PENDING,
                        lastError = error.message ?: "Send failed",
                    )
                }
                if (!permanent) {
                    return@withLock OutboxFlushResult(shouldRetry = true)
                }
            }

            item = stateStore.current().outbox.firstOrNull {
                it.status == PersistedOutboxStatus.PENDING || it.status == PersistedOutboxStatus.SENDING
            }
        }
        OutboxFlushResult(shouldRetry = false)
    }

    fun schedule() {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, MIN_BACKOFF_SECONDS, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }

    fun cancelScheduledWork() {
        workManager.cancelUniqueWork(WORK_NAME)
    }

    private suspend fun send(item: PersistedOutboxItem, tokenProvider: TokenProvider): OutboxSendResult =
        when (item.kind) {
            PersistedOutboxKind.CREATE_CONVERSATION -> {
                val request = requireNotNull(item.createRequest)
                val conversation = conversationRepository.createConversation(item.workspaceId, request, tokenProvider)
                OutboxSendResult(conversationId = conversation.sId)
            }
            PersistedOutboxKind.POST_MESSAGE -> {
                val conversationId = requireNotNull(item.conversationId)
                item.contentFragments.forEach { fragment ->
                    fileRepository.postContentFragment(item.workspaceId, conversationId, fragment, tokenProvider)
                }
                val response = conversationRepository.postMessage(
                    item.workspaceId,
                    conversationId,
                    requireNotNull(item.messageRequest),
                    tokenProvider,
                )
                OutboxSendResult(conversationId, response.message.sId)
            }
            PersistedOutboxKind.NOTIFICATION_REPLY -> sendNotificationReply(item, tokenProvider)
        }

    private suspend fun sendNotificationReply(
        item: PersistedOutboxItem,
        tokenProvider: TokenProvider,
    ): OutboxSendResult {
        val conversationId = requireNotNull(item.conversationId)
        val text = requireNotNull(item.notificationReplyText).trim()
        require(text.isNotEmpty())
        val user = userRepository.fetchDustUser(tokenProvider)
        val messages = conversationRepository.fetchMessages(
            item.workspaceId,
            conversationId,
            tokenProvider,
            limit = 20,
        ).messages
        val response = conversationRepository.postMessage(
            workspaceId = item.workspaceId,
            conversationId = conversationId,
            request = PostMessageRequest(
                content = text,
                mentions = listOf(MentionPayload(replyAgentConfigurationId(messages))),
                context = MessageContext(
                    timezone = java.util.TimeZone.getDefault().id,
                    profilePictureUrl = user.image,
                ),
                clientRequestId = item.id,
            ),
            tokenProvider = tokenProvider,
        )
        return OutboxSendResult(conversationId, response.message.sId)
    }

    private suspend fun updateItem(id: String, transform: (PersistedOutboxItem) -> PersistedOutboxItem) {
        stateStore.update { state ->
            state.copy(outbox = state.outbox.map { if (it.id == id) transform(it) else it }.retainingUnacknowledgedMessages())
        }
    }

    private companion object {
        const val WORK_NAME = "dust-durable-outbox"
        const val MIN_BACKOFF_SECONDS = 10L
    }
}

internal data class OutboxFlushResult(val shouldRetry: Boolean)

private data class OutboxSendResult(val conversationId: String, val messageId: String? = null)

private fun Throwable.isPermanentOutboxFailure(): Boolean =
    this is ApiError.Http && statusCode in 400..499 && statusCode !in setOf(408, 409, 425, 429)
