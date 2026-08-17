package com.dust.mobile.core.model

private val STEERING_STATUSES = setOf(AgentMessageStatus.GRACEFULLY_STOPPED, AgentMessageStatus.INTERRUPTED)

data class CitationDisplayEntry(
    val ref: String,
    val number: Int,
    val citation: CitationReference,
)

data class ActivityTimelineDisplay(
    val headerLabel: String?,
    val rows: List<ActivityTimelineRow>,
)

data class ActivityTimelineRow(
    val id: String,
    val kind: ActivityTimelineRowKind,
    val label: String?,
    val serverName: String? = null,
    val isTruncated: Boolean = false,
    val isExpandable: Boolean = false,
)

enum class ActivityTimelineRowKind {
    THINKING,
    ACTION,
    ACTIVE_THINKING,
    ACTIVE_ACTION,
    IDLE,
    DONE,
}

data class ToolApprovalDisplay(
    val title: String,
    val approveLabel: String,
    val canAlwaysAllow: Boolean,
    val inputs: List<Pair<String, String>>,
)

fun steeredAgentHeaderMessageIds(messages: List<ConversationMessage>): Set<String> {
    val hiddenIds = mutableSetOf<String>()
    var previousAgent: AgentMessage? = null
    messages.forEach { message ->
        if (message is ConversationMessage.Agent) {
            val prior = previousAgent
            if (
                prior != null &&
                prior.configuration.sId == message.message.configuration.sId &&
                prior.status in STEERING_STATUSES
            ) {
                hiddenIds.add(message.id)
            }
            previousAgent = message.message
        }
    }
    return hiddenIds
}

fun shouldHideSteeredAgentHeader(messages: List<ConversationMessage>, index: Int): Boolean {
    val message = messages.getOrNull(index) as? ConversationMessage.Agent ?: return false
    return message.id in steeredAgentHeaderMessageIds(messages)
}

fun isCurrentUserMessage(message: UserMessage, currentUserEmail: String): Boolean =
    message.context?.email?.equals(currentUserEmail, ignoreCase = true) == true

fun activeCitationEntries(
    citeMapping: List<CiteEntry>,
    citations: Map<String, CitationReference>?,
): List<CitationDisplayEntry> =
    citeMapping.mapNotNull { entry ->
        citations?.get(entry.ref)?.let { citation ->
            CitationDisplayEntry(ref = entry.ref, number = entry.number, citation = citation)
        }
    }

fun displayableGeneratedFiles(message: AgentMessage): List<GeneratedFile> =
    if (message.isStreaming) {
        emptyList()
    } else {
        message.generatedFiles.orEmpty().filter { it.isVisible }
    }

fun inlineBlockedStateForMessage(
    message: ConversationMessage,
    streamingMessageId: String?,
    blockedState: BlockedState?,
): BlockedState? {
    if (blockedState == null || message !is ConversationMessage.Agent) return null
    if (!message.message.isStreaming || message.id != streamingMessageId) return null

    return when (blockedState) {
        is BlockedState.Approval ->
            blockedState.takeIf { it.approval.messageId.isBlank() || it.approval.messageId == message.id }

        is BlockedState.UserQuestionRequired ->
            blockedState.takeIf { it.question.messageId.isBlank() || it.question.messageId == message.id }

        is BlockedState.FileAuth,
        is BlockedState.PersonalAuth,
        -> blockedState
    }
}

fun activityTimelineDisplay(
    isStreaming: Boolean,
    isGenerating: Boolean,
    isBlocking: Boolean = false,
    chainOfThought: String?,
    completedSteps: List<ActivityStep>,
    activeActions: List<ActiveAction>,
    expandedThinkingIds: Set<String> = emptySet(),
): ActivityTimelineDisplay {
    val hasContent = completedSteps.isNotEmpty() ||
        (isStreaming && !chainOfThought.isNullOrBlank()) ||
        activeActions.isNotEmpty()

    if (!hasContent && isStreaming && isBlocking) {
        return ActivityTimelineDisplay(headerLabel = null, rows = emptyList())
    }

    if (!hasContent && isStreaming) {
        return ActivityTimelineDisplay(
            headerLabel = null,
            rows = listOf(
                ActivityTimelineRow(
                    id = "idle",
                    kind = ActivityTimelineRowKind.IDLE,
                    label = if (isGenerating) "Writing..." else "Thinking...",
                ),
            ),
        )
    }

    if (!hasContent) {
        return ActivityTimelineDisplay(headerLabel = null, rows = emptyList())
    }

    val rows = buildList {
        completedSteps.forEach { step ->
            when (step) {
                is ActivityStep.Thinking -> {
                    val isExpandable = step.content.length > MAX_THINKING_DISPLAY_LENGTH
                    val isTruncated = isExpandable && step.id !in expandedThinkingIds
                    add(
                        ActivityTimelineRow(
                            id = step.id,
                            kind = ActivityTimelineRowKind.THINKING,
                            label = if (isTruncated) {
                                step.content.take(MAX_THINKING_DISPLAY_LENGTH) + "..."
                            } else {
                                step.content
                            },
                            isTruncated = isTruncated,
                            isExpandable = isExpandable,
                        ),
                    )
                }
                is ActivityStep.Action -> add(
                    ActivityTimelineRow(
                        id = step.id,
                        kind = ActivityTimelineRowKind.ACTION,
                        label = step.label,
                        serverName = step.serverName,
                    ),
                )
            }
        }

        if (isStreaming && !chainOfThought.isNullOrBlank()) {
            val activeThinking = if (chainOfThought.length > MAX_ACTIVE_THINKING_DISPLAY_LENGTH) {
                "..." + chainOfThought.takeLast(MAX_ACTIVE_THINKING_DISPLAY_LENGTH)
            } else {
                chainOfThought
            }
            add(
                ActivityTimelineRow(
                    id = "active-thinking",
                    kind = ActivityTimelineRowKind.ACTIVE_THINKING,
                    label = activeThinking,
                ),
            )
        }

        activeActions.forEach { action ->
            add(
                ActivityTimelineRow(
                    id = "active-action-${action.id}",
                    kind = ActivityTimelineRowKind.ACTIVE_ACTION,
                    label = action.label,
                    serverName = action.serverName,
                ),
            )
        }

        if (isStreaming && !isBlocking && chainOfThought.isNullOrBlank() && activeActions.isEmpty()) {
            add(
                ActivityTimelineRow(
                    id = "idle",
                    kind = ActivityTimelineRowKind.IDLE,
                    label = null,
                ),
            )
        }

        if (!isStreaming && completedSteps.isNotEmpty()) {
            add(
                ActivityTimelineRow(
                    id = "done",
                    kind = ActivityTimelineRowKind.DONE,
                    label = "Done",
                ),
            )
        }
    }

    return ActivityTimelineDisplay(
        headerLabel = when {
            !isStreaming -> "Completed"
            activeActions.isNotEmpty() -> "Working..."
            isGenerating -> "Writing..."
            else -> "Thinking..."
        },
        rows = rows,
    )
}

const val MAX_THINKING_DISPLAY_LENGTH = 420
const val MAX_ACTIVE_THINKING_DISPLAY_LENGTH = 1_200

fun toolApprovalDisplay(approval: ToolApprovalInfo): ToolApprovalDisplay {
    val server = approval.mcpServerName ?: "Tool"
    val title = approval.toolName?.let { tool ->
        "Allow $server to $tool?"
    } ?: "$server requires approval"
    return ToolApprovalDisplay(
        title = title,
        approveLabel = if (approval.canAlwaysAllow) "Allow once" else "Allow",
        canAlwaysAllow = approval.canAlwaysAllow,
        inputs = approval.displayableInputs,
    )
}
