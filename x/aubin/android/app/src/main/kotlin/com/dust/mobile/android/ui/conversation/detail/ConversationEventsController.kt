package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationEventData
import com.dust.mobile.core.stream.StreamEventCursor
import com.dust.mobile.core.stream.StreamingEventParser
import com.dust.mobile.core.stream.StreamingReconnect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal class ConversationEventsController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val conversation: Conversation,
    private val coroutineScope: CoroutineScope,
    private val onEvent: suspend (ConversationEventData) -> Unit,
) {
    private var streamJob: Job? = null

    fun start() {
        streamJob?.cancel()
        streamJob = coroutineScope.launch {
            val cursor = StreamEventCursor()
            var retryDelayMs = StreamingReconnect.INITIAL_RETRY_DELAY_MS

            while (isActive) {
                var shouldBackOff = false
                runCatching {
                    graph.sseClient.eventStream(
                        endpoint = Endpoints.conversationEvents(workspaceId, conversation.sId),
                        tokenProvider = tokenProvider,
                        lastEventId = cursor.lastEventId,
                    ).collect { payload ->
                        val envelope = runCatching {
                            StreamingEventParser.parseConversationEvent(payload)
                        }.getOrElse {
                            return@collect
                        }
                        if (!cursor.shouldProcess(envelope.eventId)) return@collect
                        retryDelayMs = StreamingReconnect.INITIAL_RETRY_DELAY_MS
                        onEvent(envelope.data)
                    }
                }.onFailure {
                    if (!isActive) return@launch
                    shouldBackOff = true
                }

                val reconnectDelay = StreamingReconnect.nextDelay(shouldBackOff, retryDelayMs)
                retryDelayMs = reconnectDelay.nextRetryDelayMs
                delay(reconnectDelay.delayMs)
            }
        }
    }

    fun clear() {
        streamJob?.cancel()
    }
}
