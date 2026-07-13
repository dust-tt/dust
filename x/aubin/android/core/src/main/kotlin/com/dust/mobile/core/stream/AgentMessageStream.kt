package com.dust.mobile.core.stream

import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.GenerationTokensEvent
import com.dust.mobile.core.model.StreamingEventData
import com.dust.mobile.core.model.TokenClassification

class AgentMessageStream(messageId: String) {
    enum class Activity {
        THINKING,
        GENERATING,
    }

    data class Snapshot(
        val messageId: String,
        val content: String = "",
        val chainOfThought: String? = null,
        val activity: Activity = Activity.THINKING,
        val activeActions: List<ActiveAction> = emptyList(),
        val completedSteps: List<ActivityStep> = emptyList(),
        val error: ErrorInfo? = null,
        val status: AgentMessageStatus? = null,
        val generatedFiles: List<GeneratedFile>? = null,
        val citations: Map<String, CitationReference>? = null,
    ) {
        val isFinished: Boolean
            get() = status != null
    }

    var snapshot: Snapshot = Snapshot(messageId = messageId)
        private set

    private var thinkingBuffer = ""
    private var lastGenerationTraceId: String? = null
    private var retryThinkingBuffer: String? = null
    private var stepCounter = 0

    fun apply(event: StreamingEventData) {
        when (event) {
            is StreamingEventData.GenerationTokens -> applyTokens(event.event)
            is StreamingEventData.ToolParams -> {
                flushThinkingBuffer()
                snapshot = snapshot.copy(chainOfThought = null)
                val action = ActiveAction(
                    id = event.event.action.id,
                    label = event.event.action.displayLabels?.running
                        ?: event.event.action.toolName
                        ?: "Working...",
                    serverName = event.event.action.internalMCPServerName,
                )
                if (snapshot.activeActions.none { it.id == action.id }) {
                    snapshot = snapshot.copy(activeActions = snapshot.activeActions + action)
                }
            }
            is StreamingEventData.AgentActionSuccess -> {
                val doneLabel = event.event.action.displayLabels?.done
                    ?: event.event.action.toolName
                    ?: "Tool"
                stepCounter += 1
                snapshot = snapshot.copy(
                    completedSteps = snapshot.completedSteps + ActivityStep.Action(
                        id = "action-$stepCounter",
                        label = doneLabel,
                        serverName = event.event.action.internalMCPServerName,
                    ),
                    activeActions = snapshot.activeActions.filterNot { it.id == event.event.action.id },
                )
            }
            is StreamingEventData.AgentMessageSuccess ->
                finalize(AgentMessageStatus.SUCCEEDED, event.event.message)
            is StreamingEventData.AgentMessageGracefullyStopped ->
                finalize(AgentMessageStatus.GRACEFULLY_STOPPED, event.event.message)
            is StreamingEventData.AgentError -> {
                snapshot = snapshot.copy(error = ErrorInfo.from(event.event.error, snapshot.messageId))
                finalize(AgentMessageStatus.FAILED, null)
            }
            is StreamingEventData.ToolError -> {
                snapshot = snapshot.copy(error = ErrorInfo.from(event.event.error, snapshot.messageId))
                finalize(AgentMessageStatus.FAILED, null)
            }
            is StreamingEventData.AgentGenerationCancelled -> {
                val status = if (event.event.status == "interrupted") {
                    AgentMessageStatus.INTERRUPTED
                } else {
                    AgentMessageStatus.CANCELLED
                }
                finalize(status, null)
            }
            StreamingEventData.AgentContextPruned,
            StreamingEventData.EndOfStream,
            is StreamingEventData.ToolApproveExecution,
            is StreamingEventData.ToolAskUserQuestion,
            is StreamingEventData.ToolFileAuthRequired,
            is StreamingEventData.ToolNotification,
            is StreamingEventData.ToolPersonalAuthRequired,
            is StreamingEventData.Unknown,
            -> Unit
        }
    }

    private fun applyTokens(tokens: GenerationTokensEvent) {
        val traceChanged = didTraceChange(tokens.traceId)
        when (tokens.classification) {
            TokenClassification.TOKENS -> {
                retryThinkingBuffer = null
                val current = if (traceChanged) "" else snapshot.content
                snapshot = snapshot.copy(
                    content = current + tokens.text,
                    activity = Activity.GENERATING,
                )
            }
            TokenClassification.CHAIN_OF_THOUGHT -> {
                if (traceChanged) {
                    snapshot = snapshot.copy(content = "")
                    retryThinkingBuffer = ""
                }

                if (retryThinkingBuffer != null) {
                    val nextRetryThinking = retryThinkingBuffer.orEmpty() + tokens.text
                    retryThinkingBuffer = nextRetryThinking
                    val existing = snapshot.chainOfThought
                    if (existing != null && existing.startsWith(nextRetryThinking)) {
                        snapshot = snapshot.copy(activity = Activity.THINKING)
                        return
                    }
                    snapshot = snapshot.copy(chainOfThought = nextRetryThinking)
                    thinkingBuffer = nextRetryThinking
                    retryThinkingBuffer = null
                } else {
                    snapshot = snapshot.copy(
                        chainOfThought = snapshot.chainOfThought.orEmpty() + tokens.text,
                    )
                    thinkingBuffer += tokens.text
                }
                snapshot = snapshot.copy(activity = Activity.THINKING)
            }
            TokenClassification.OPENING_DELIMITER,
            TokenClassification.CLOSING_DELIMITER,
            -> Unit
        }
    }

    private fun didTraceChange(traceId: String?): Boolean {
        if (traceId == null) return false
        val changed = lastGenerationTraceId?.let { it != traceId } == true
        lastGenerationTraceId = traceId
        return changed
    }

    private fun finalize(status: AgentMessageStatus, final: AgentMessage?) {
        flushThinkingBuffer()
        snapshot = snapshot.copy(
            content = final?.content ?: snapshot.content,
            chainOfThought = if (final != null) final.chainOfThought else snapshot.chainOfThought,
            generatedFiles = if (final != null) final.generatedFiles else snapshot.generatedFiles,
            citations = if (final != null) final.citations else snapshot.citations,
            status = status,
            activeActions = emptyList(),
        )
    }

    private fun flushThinkingBuffer() {
        val text = thinkingBuffer.trim()
        if (text.isEmpty()) return
        stepCounter += 1
        snapshot = snapshot.copy(
            completedSteps = snapshot.completedSteps + ActivityStep.Thinking(
                id = "thinking-$stepCounter",
                content = text,
            ),
        )
        thinkingBuffer = ""
        retryThinkingBuffer = null
    }
}
