package com.dust.mobile.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.util.LruCache
import com.dust.mobile.android.audio.AndroidSpeechRecorder
import com.dust.mobile.android.audio.ScribeRealtimeClient
import com.dust.mobile.android.audio.ScribeTranscriptEvent
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.AgentMessageDoneEventData
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationAttachment
import com.dust.mobile.core.model.ConversationEventData
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ConversationPreview
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.CreateMessagePayload
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.UserMessageContext
import com.dust.mobile.core.model.MessageUser
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.model.nextBlockedActionStreamMessageId
import com.dust.mobile.core.model.canSendMessage
import com.dust.mobile.core.model.canRespondToBlockedAction
import com.dust.mobile.core.model.contentWithSkillTags
import com.dust.mobile.core.model.filteredByTitleSearch
import com.dust.mobile.core.model.loadConversationListData
import com.dust.mobile.core.model.optimisticUserMessage
import com.dust.mobile.core.model.replyAgentConfigurationId
import com.dust.mobile.core.model.reconciledBlockedState
import com.dust.mobile.core.model.retargetReplyAgentForMessages
import com.dust.mobile.core.model.removeTrailingAgentPickerTrigger
import com.dust.mobile.core.model.selectedToolIds
import com.dust.mobile.core.model.shouldOpenAgentPicker
import com.dust.mobile.core.model.sortAgentsForPicker
import com.dust.mobile.core.model.toBlockedState
import com.dust.mobile.core.model.withUpdatedTitle
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.repository.ConversationAction
import com.dust.mobile.core.stream.AgentMessageStream
import com.dust.mobile.core.stream.StreamEventCursor
import com.dust.mobile.core.stream.StreamingReconnect
import com.dust.mobile.core.stream.StreamingEventParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.min

private const val KNOWLEDGE_SEARCH_DEBOUNCE_MS = 300L
private const val LOGIN_CALLBACK_GRACE_MS = 1_500L
private const val DUST_AGENT_AVATAR_URL = "https://dust.tt/static/systemavatar/dust_avatar_full.png"
private const val SALES_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
private const val LAUNCH_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
private const val MEMORY_AGENT_AVATAR_URL = "https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"
internal const val SESSION_EXPIRED_NOTICE = "Your session expired. Sign in again to continue."
internal const val FRAME_SIGN_IN_NOTICE = "Sign in to view this shared frame."

sealed interface AuthUiState {
    data object Loading : AuthUiState
    data class Unauthenticated(val notice: String? = null) : AuthUiState
    data object Authenticating : AuthUiState
    data class Authenticated(
        val user: User,
        val tokenProvider: TokenProvider,
        val sessionKey: String,
        val isLocalPreview: Boolean = false,
    ) : AuthUiState
    data class Error(val message: String) : AuthUiState
}

data class SpeechInputState(
    val isPresented: Boolean = false,
    val isConnecting: Boolean = false,
    val isRecording: Boolean = false,
    val isFinalizing: Boolean = false,
    val audioLevel: Float = 0f,
    val transcript: String = "",
    val error: String? = null,
) {
    val isBusy: Boolean
        get() = isConnecting || isRecording || isFinalizing
}

private class SpeechInputHandler(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val workspaceId: String,
    private val scope: CoroutineScope,
    private val isLocalPreview: Boolean,
) {
    private val recorder = AndroidSpeechRecorder()
    private val _state = MutableStateFlow(SpeechInputState())
    val state: StateFlow<SpeechInputState> = _state.asStateFlow()
    private var client: ScribeRealtimeClient? = null
    private var sessionJob: Job? = null
    private var finalizeJob: Job? = null
    private var committedText = ""
    private var partialText = ""
    private var onTranscript: ((String) -> Unit)? = null

    fun setError(message: String) {
        _state.update { it.copy(isPresented = true, error = message) }
    }

    fun start(onTranscript: (String) -> Unit) {
        if (_state.value.isBusy) return
        this.onTranscript = onTranscript
        committedText = ""
        partialText = ""
        finalizeJob?.cancel()
        _state.update {
            SpeechInputState(isPresented = true, isConnecting = true)
        }
        if (isLocalPreview) {
            _state.update { SpeechInputState(isPresented = true, isRecording = true) }
            sessionJob?.cancel()
            sessionJob = scope.launch {
                val words = "Draft a concise launch update with owners and next steps".split(" ")
                words.indices.forEach { index ->
                    delay(260)
                    if (!_state.value.isRecording) return@launch
                    partialText = words.take(index + 1).joinToString(" ")
                    _state.update {
                        it.copy(audioLevel = listOf(0.18f, 0.42f, 0.28f, 0.56f)[index % 4])
                    }
                    publishTranscript()
                }
                _state.update { it.copy(audioLevel = 0.24f) }
                while (isActive && _state.value.isRecording) {
                    delay(1_000)
                }
            }
            return
        }
        sessionJob?.cancel()
        sessionJob = scope.launch {
            try {
                val token = graph.transcriptionRepository.fetchRealtimeToken(workspaceId, tokenProvider)
                ScribeRealtimeClient(token.token, token.baseUri) { event ->
                    scope.launch { handleEvent(event) }
                }.also { socket ->
                    client = socket
                    socket.connect()
                    recorder.start { audio, level ->
                        socket.sendAudio(audio)
                        _state.update { state ->
                            if (state.isRecording) state.copy(audioLevel = level) else state
                        }
                    }
                }
                _state.update {
                    it.copy(isConnecting = false, isRecording = true, error = null)
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                fail(error.message ?: "Could not start recording")
            }
        }
    }

    fun stop() {
        if (!_state.value.isRecording) return
        if (isLocalPreview) sessionJob?.cancel()
        recorder.stop()
        _state.update { it.copy(isRecording = false, isFinalizing = true, audioLevel = 0f) }
        client?.commit()
        finalizeJob?.cancel()
        finalizeJob = scope.launch {
            delay(if (isLocalPreview) 350 else 2_000)
            finish()
        }
    }

    fun cancel() {
        sessionJob?.cancel()
        sessionJob = null
        finalizeJob?.cancel()
        finalizeJob = null
        recorder.stop()
        client?.close()
        client = null
        committedText = ""
        partialText = ""
        onTranscript = null
        _state.update { SpeechInputState() }
    }

    private fun handleEvent(event: ScribeTranscriptEvent) {
        when (event) {
            is ScribeTranscriptEvent.Partial -> {
                partialText = event.text
                publishTranscript()
            }
            is ScribeTranscriptEvent.Committed -> {
                committedText = textWithAppendedTranscript(committedText, event.text)
                partialText = ""
                publishTranscript()
                if (_state.value.isFinalizing) finish()
            }
            is ScribeTranscriptEvent.Error -> fail(event.message)
            ScribeTranscriptEvent.Ignored -> Unit
        }
    }

    private fun publishTranscript() {
        val transcript = textWithAppendedTranscript(committedText, partialText)
        _state.update { it.copy(transcript = transcript) }
        onTranscript?.invoke(transcript)
    }

    private fun finish() {
        finalizeJob?.cancel()
        finalizeJob = null
        client?.close()
        client = null
        _state.update { it.copy(isFinalizing = false, audioLevel = 0f) }
    }

    private fun fail(message: String) {
        sessionJob?.cancel()
        sessionJob = null
        finalizeJob?.cancel()
        finalizeJob = null
        recorder.stop()
        client?.close()
        client = null
        _state.update {
            it.copy(
                isPresented = true,
                isConnecting = false,
                isRecording = false,
                isFinalizing = false,
                audioLevel = 0f,
                error = message,
            )
        }
    }
}

internal fun textWithAppendedTranscript(existingText: String, transcript: String): String {
    if (transcript.isEmpty()) return existingText
    return if (existingText.isEmpty()) transcript else "$existingText $transcript"
}

private fun buildMessageContext(capabilities: List<Capability>, profilePictureUrl: String?): MessageContext {
    val toolIds = selectedToolIds(capabilities)
    return MessageContext(
        timezone = ZoneId.systemDefault().id,
        profilePictureUrl = profilePictureUrl,
        selectedMCPServerViewIds = toolIds.ifEmpty { null },
    )
}

private fun localPreviewUser(): User =
    User(
        id = "local-preview-user",
        email = "lea.martin@dust.tt",
        emailVerified = true,
        firstName = "Lea",
        lastName = "Martin",
    )

private fun localPreviewDustUser(): DustUser =
    DustUser(
        sId = "local-preview-user",
        firstName = "Lea",
        lastName = "Martin",
        workspaces = localPreviewWorkspaces(),
        selectedWorkspace = "local-workspace",
    )

private fun localPreviewWorkspaces(): List<Workspace> =
    listOf(
        Workspace(sId = "local-workspace", name = "Revenue Team", role = "admin"),
        Workspace(sId = "local-mobile", name = "Launch Team", role = "builder"),
    )

private fun localPreviewConversationListData(workspaceId: String): ConversationListData =
    ConversationListData(
        conversations = localPreviewConversations(workspaceId),
        pods = localPreviewPods(),
    )

private fun localPreviewPods(): List<Space> =
    listOf(
        Space(
            sId = "local-pod-customers",
            name = "Customer Ops",
            kind = "project",
            description = "Customer-facing follow-ups and account preparation",
        ),
        Space(
            sId = "local-pod-mobile",
            name = "Launch Planning",
            kind = "project",
            description = "Customer launch tasks, stakeholder updates, and follow-ups",
            isRestricted = true,
        ),
    )

internal fun localPreviewConversations(workspaceId: String): List<Conversation> {
    if (workspaceId == "local-mobile") {
        return listOf(
            localPreviewConversation(
                sId = "local-briefing-mobile",
                minutesAgo = 12,
                title = "Finalize launch readiness",
                authorName = "Launch Team",
                authorAvatarUrl = LAUNCH_AGENT_AVATAR_URL,
                authorIsAgent = true,
                snippet = "Checked owner updates, customer milestones, and the final launch checklist.",
                replyCount = 6,
                unread = true,
                actionRequired = true,
            ),
            localPreviewConversation(
                sId = "local-launch-mobile",
                minutesAgo = 58,
                title = "Align stakeholder follow-ups",
                authorName = "Operations Team",
                authorAvatarUrl = SALES_AGENT_AVATAR_URL,
                authorIsAgent = true,
                snippet = "Grouped decisions, risks, and owners before the launch review.",
                replyCount = 4,
                unread = true,
            ),
            localPreviewConversation(
                sId = "local-weekly-mobile",
                minutesAgo = 1_440,
                title = "Summarize launch changes",
                authorName = "Mira Patel",
                snippet = "The launch digest is ready with product, support, and field notes.",
                replyCount = 9,
            ),
        )
    }

    return listOf(
        localPreviewConversation(
            sId = "local-briefing",
            minutesAgo = 18,
            title = "Prepare the Q3 customer briefing",
            authorName = "Sales Team",
            authorAvatarUrl = SALES_AGENT_AVATAR_URL,
            authorIsAgent = true,
            snippet = "Pulled the latest account notes and drafted the customer-ready summary.",
            replyCount = 8,
            unread = true,
            actionRequired = true,
        ),
        localPreviewConversation(
            sId = "local-launch",
            minutesAgo = 74,
            title = "Coordinate launch follow-ups",
            authorName = "Launch Team",
            authorAvatarUrl = LAUNCH_AGENT_AVATAR_URL,
            authorIsAgent = true,
            snippet = "Collected open questions, owners, and next steps before the customer call.",
            replyCount = 3,
            unread = true,
        ),
        localPreviewConversation(
            sId = "local-weekly",
            minutesAgo = 1_610,
            title = "Summarize workspace changes",
            authorName = "Mira Patel",
            snippet = "The weekly update is ready with engineering, support, and product highlights.",
            replyCount = 12,
        ),
    )
}

private fun localPreviewPodConversations(workspaceId: String, spaceId: String): List<Conversation> {
    val source = localPreviewConversations(workspaceId)
    return if (spaceId == "local-pod-mobile") {
        source.filter { it.sId.contains("launch") || it.sId.contains("weekly") }
    } else {
        source.filter { it.sId.contains("briefing") || it.sId.contains("weekly") }
    }
}

private fun localPreviewConversation(
    sId: String,
    minutesAgo: Long,
    title: String,
    authorName: String,
    authorAvatarUrl: String? = null,
    authorIsAgent: Boolean = false,
    snippet: String,
    replyCount: Int,
    unread: Boolean = false,
    actionRequired: Boolean = false,
): Conversation {
    val updatedAtMs = System.currentTimeMillis() - minutesAgo * 60_000
    return Conversation(
        sId = sId,
        created = (updatedAtMs - 20 * 60_000).toDouble(),
        updated = updatedAtMs.toDouble(),
        title = title,
        unread = unread,
        actionRequired = actionRequired,
        preview = ConversationPreview(
            authorName = authorName,
            authorAvatarUrl = authorAvatarUrl,
            isAgent = authorIsAgent,
            snippet = snippet,
            replyCount = replyCount,
        ),
    )
}

private fun localPreviewAgents(): List<LightAgentConfiguration> =
    listOf(
        LightAgentConfiguration(
            sId = DEFAULT_AGENT_CONFIGURATION_ID,
            name = "Dust",
            description = "General purpose workspace agent",
            pictureUrl = DUST_AGENT_AVATAR_URL,
            scope = "global",
            userFavorite = true,
        ),
        LightAgentConfiguration(
            sId = "local-agent-sales",
            name = "Sales Team",
            description = "Prepares account notes and customer-ready summaries",
            pictureUrl = SALES_AGENT_AVATAR_URL,
            scope = "global",
        ),
        LightAgentConfiguration(
            sId = "local-agent-launch",
            name = "Launch Team",
            description = "Coordinates customer launch follow-ups and owners",
            pictureUrl = LAUNCH_AGENT_AVATAR_URL,
            scope = "global",
        ),
        LightAgentConfiguration(
            sId = "local-agent-memory",
            name = "Memory",
            description = "Summarizes workspace history and recent decisions",
            pictureUrl = MEMORY_AGENT_AVATAR_URL,
            scope = "global",
        ),
    )

private fun localPreviewCapabilities(workspaceId: String): List<Capability> =
    listOf(
        Capability.Tool(
            MCPServerView(
                sId = "local-tool-notion-$workspaceId",
                name = "Notion",
                description = "Search docs and project notes",
                spaceId = "local-global-space",
                server = MCPServer(
                    sId = "local-server-notion",
                    name = "Notion",
                    description = "Search docs and project notes",
                ),
            ),
        ),
        Capability.Tool(
            MCPServerView(
                sId = "local-tool-slack-$workspaceId",
                name = "Slack",
                description = "Read relevant workspace threads",
                spaceId = "local-global-space",
                server = MCPServer(
                    sId = "local-server-slack",
                    name = "Slack",
                    description = "Read relevant workspace threads",
                ),
            ),
        ),
        Capability.SkillCapability(
            Skill(
                sId = "local-skill-briefing",
                name = "Customer briefing",
                userFacingDescription = "Create a concise account brief from recent updates.",
            ),
        ),
    ).sortedBy { it.sortKey }

private fun localPreviewKnowledgeItems(query: String): List<KnowledgeItem> =
    listOf(
        KnowledgeItem(
            title = "Q3 account plan",
            internalId = "local-q3-account-plan",
            dataSourceViewId = "local-dsv-notion",
            connectorProvider = "notion",
            nodeType = "document",
        ),
        KnowledgeItem(
            title = "Renewal meeting notes",
            internalId = "local-renewal-notes",
            dataSourceViewId = "local-dsv-drive",
            connectorProvider = "google_drive",
            nodeType = "document",
        ),
        KnowledgeItem(
            title = "Launch stakeholder thread",
            internalId = "local-launch-thread",
            dataSourceViewId = "local-dsv-slack",
            connectorProvider = "slack",
            nodeType = "thread",
        ),
    ).filter { item ->
        item.title.contains(query, ignoreCase = true) ||
            item.connectorProvider?.contains(query, ignoreCase = true) == true
    }.ifEmpty {
        listOf(
            KnowledgeItem(
                title = "Suggested source for \"$query\"",
                internalId = "local-result-${query.hashCode()}",
                dataSourceViewId = "local-dsv-preview",
                connectorProvider = "local",
                nodeType = "document",
            ),
        )
    }

private fun localPreviewMessages(conversationId: String): List<ConversationMessage> {
    val title = when {
        conversationId.contains("briefing-mobile") -> "Finalize launch readiness"
        conversationId.contains("launch-mobile") -> "Align stakeholder follow-ups"
        conversationId.contains("weekly-mobile") -> "Summarize launch changes"
        conversationId.contains("briefing") -> "Prepare the Q3 customer briefing"
        conversationId.contains("launch") -> "Coordinate launch follow-ups"
        conversationId.contains("weekly") -> "Summarize workspace changes"
        else -> "Customer briefing"
    }
    val baseCreatedMs = System.currentTimeMillis() - 12 * 60_000
    return listOf(
        localPreviewUserMessage(
            sId = "$conversationId-user-1",
            rank = 0,
            createdMs = baseCreatedMs,
            content = "Can you help with \"$title\" and keep it concise?",
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-agent-1",
            rank = 1,
            createdMs = baseCreatedMs + 90_000,
            content = "I pulled together the relevant context and highlighted the main decisions, risks, and next steps.",
            generatedFiles = listOf(
                GeneratedFile(
                    fileId = "local-file-$conversationId-summary",
                    title = "Briefing summary.md",
                    contentType = "text/markdown",
                ),
            ),
        ),
        localPreviewUserMessage(
            sId = "$conversationId-user-2",
            rank = 2,
            createdMs = baseCreatedMs + 180_000,
            content = "Turn this into a short action list for the account team.",
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-agent-2",
            rank = 3,
            createdMs = baseCreatedMs + 270_000,
            content = "Action list: confirm the customer story, assign owners for the open risks, and send the briefing before the next account review.",
        ),
    )
}

private fun localPreviewReplyMessages(
    text: String,
    user: User,
    startRank: Int,
    conversationId: String,
): List<ConversationMessage> {
    val nowMs = System.currentTimeMillis()
    return listOf(
        localPreviewUserMessage(
            sId = "$conversationId-local-reply-user-$nowMs",
            rank = startRank,
            createdMs = nowMs,
            content = text.ifBlank { "Local attachment added." },
            user = user,
        ),
        localPreviewAgentMessage(
            sId = "$conversationId-local-reply-agent-$nowMs",
            rank = startRank + 1,
            createdMs = nowMs + 1_000,
            content = "I drafted a concise response with the recommendation, open questions, and next steps ready for the account team.",
        ),
    )
}

private fun localPreviewConversationFromDraft(
    text: String,
    agentId: String,
    capabilities: List<Capability>,
    knowledgeItems: List<KnowledgeItem>,
    spaceId: String?,
): Conversation {
    val nowMs = System.currentTimeMillis()
    val contextLabels = (capabilities.map { it.displayName } + knowledgeItems.map { it.title })
        .take(2)
        .joinToString(", ")
    val suffix = if (contextLabels.isBlank()) "" else " using $contextLabels"
    return Conversation(
        sId = "local-created-$nowMs",
        created = nowMs.toDouble(),
        updated = nowMs.toDouble(),
        title = localPreviewConversationTitle(text),
        unread = false,
        actionRequired = false,
        preview = ConversationPreview(
            authorName = localPreviewConversationAuthorName(agentId),
            authorAvatarUrl = localPreviewAgentAvatarUrl(agentId),
            isAgent = true,
            snippet = "Drafted a concise response${spaceId?.let { " in the selected pod" }.orEmpty()}$suffix.",
            replyCount = 1,
        ),
    )
}

internal fun localPreviewConversationAuthorName(agentId: String): String =
    when (agentId) {
        DEFAULT_AGENT_CONFIGURATION_ID -> "Dust"
        "local-agent-sales" -> "Sales Team"
        "local-agent-launch" -> "Launch Team"
        "local-agent-memory" -> "Memory"
        else -> "Dust"
    }

internal fun localPreviewAgentAvatarUrl(agentId: String): String =
    when (agentId) {
        DEFAULT_AGENT_CONFIGURATION_ID -> DUST_AGENT_AVATAR_URL
        "local-agent-sales" -> SALES_AGENT_AVATAR_URL
        "local-agent-launch" -> LAUNCH_AGENT_AVATAR_URL
        "local-agent-memory" -> MEMORY_AGENT_AVATAR_URL
        else -> DUST_AGENT_AVATAR_URL
    }

internal fun localPreviewConversationTitle(text: String): String {
    val trimmed = text.trim()
    return when {
        trimmed.equals("Draft customer brief", ignoreCase = true) -> "Briefing"
        trimmed.contains("\"Customer briefing\"", ignoreCase = true) -> "Briefing"
        trimmed.equals("Summarize updates", ignoreCase = true) -> "Workspace summary"
        else -> trimmed.take(40).ifBlank { "Customer briefing" }
    }
}

private fun localPreviewUserMessage(
    sId: String,
    rank: Int,
    createdMs: Long,
    content: String,
    user: User = localPreviewUser(),
): ConversationMessage.User =
    ConversationMessage.User(
        UserMessage(
            id = rank + 1,
            sId = sId,
            type = MessageType.USER,
            created = createdMs.toDouble(),
            visibility = "visible",
            version = 1,
            rank = rank,
            content = content,
            user = MessageUser(fullName = user.displayName, image = user.profilePictureUrl),
            context = UserMessageContext(
                fullName = user.displayName,
                email = user.email,
                profilePictureUrl = user.profilePictureUrl,
            ),
        ),
    )

private fun localPreviewAgentMessage(
    sId: String,
    rank: Int,
    createdMs: Long,
    content: String,
    generatedFiles: List<GeneratedFile>? = null,
): ConversationMessage.Agent =
    ConversationMessage.Agent(
        AgentMessage(
            sId = sId,
            type = MessageType.AGENT,
            created = createdMs.toDouble(),
            visibility = "visible",
            version = 1,
            rank = rank,
            status = AgentMessageStatus.SUCCEEDED,
            content = content,
            chainOfThought = "Looked across the sample workspace notes and selected the most relevant items.",
            configuration = AgentConfiguration(
                sId = DEFAULT_AGENT_CONFIGURATION_ID,
                name = "Dust",
                pictureUrl = DUST_AGENT_AVATAR_URL,
            ),
            generatedFiles = generatedFiles,
        ),
    )

private fun localPreviewAttachments(conversationId: String): List<ConversationAttachment> =
    listOf(
        ConversationAttachment(
            fileId = "local-file-$conversationId-summary",
            title = "Briefing summary.md",
            contentType = "text/markdown",
            source = "local",
        ),
        ConversationAttachment(
            fileId = "local-file-$conversationId-checklist",
            title = "Account checklist.txt",
            contentType = "text/plain",
            source = "local",
        ),
    )

private fun localPreviewFileData(fileId: String): ByteArray {
    val content = if (fileId.contains("checklist", ignoreCase = true)) {
        """
        # Account review checklist

        - Confirm the customer story and latest account notes.
        - Assign an owner for every open risk.
        - Attach source material before sending the briefing.
        - Share next steps with the account team after the review.
        """.trimIndent()
    } else {
        """
        # Customer briefing summary

        The account is ready for review. Recent workspace activity points to three priorities:

        - Align the customer story with the latest support notes.
        - Keep the action list short enough to review on mobile.
        - Attach source material before handing the briefing to the team.

        Use this as a starting point before the customer call.
        """.trimIndent()
    }
    return content.toByteArray()
}

class AuthViewModel(
    private val graph: AppGraph,
) : ViewModel() {
    private val _state = MutableStateFlow<AuthUiState>(AuthUiState.Loading)
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    private var pendingCodeVerifier: String? = graph.tokenStore.loadPendingCodeVerifier()
    private var loginReturnJob: Job? = null
    private var localPreviewActive = false
    private var sessionCounter = 0

    init {
        if (pendingCodeVerifier != null) {
            _state.value = AuthUiState.Authenticating
        }
        restoreSession()
    }

    fun startLogin(openUrl: (String) -> Unit) {
        startAuth(openUrl, graph.authService::buildLoginUrl)
    }

    fun startSignUp(openUrl: (String) -> Unit) {
        startAuth(openUrl, graph.authService::buildSignUpUrl)
    }

    fun startLocalPreview() {
        if (!graph.localAuthBypassEnabled) return
        localPreviewActive = true
        loginReturnJob?.cancel()
        graph.tokenStore.clearTokens()
        clearPendingAuth()
        val user = localPreviewUser()
        val provider = graph.localPreviewTokenProvider { handleSessionExpired() }
        _state.value = AuthUiState.Authenticated(
            user = user,
            tokenProvider = provider,
            sessionKey = nextSessionKey(user),
            isLocalPreview = true,
        )
    }

    private fun startAuth(
        openUrl: (String) -> Unit,
        buildAuthUrl: (String) -> String,
    ) {
        localPreviewActive = false
        val pkce = runCatching { graph.authService.generatePkce() }.getOrElse { error ->
            _state.value = AuthUiState.Error(error.message ?: "Failed to start login")
            return
        }
        pendingCodeVerifier = pkce.codeVerifier
        graph.tokenStore.savePendingCodeVerifier(pkce.codeVerifier)
        loginReturnJob?.cancel()
        _state.value = AuthUiState.Authenticating
        openUrl(buildAuthUrl(pkce.codeChallenge))
    }

    fun handleCallback(callbackUrl: String) {
        localPreviewActive = false
        val code = graph.authService.extractCode(callbackUrl)
        val verifier = pendingCodeVerifier ?: graph.tokenStore.loadPendingCodeVerifier()
        loginReturnJob?.cancel()
        if (code == null || verifier == null) {
            clearPendingAuth()
            _state.value = AuthUiState.Error("No authorization code received")
            return
        }

        viewModelScope.launch {
            runCatching {
                graph.authService.exchangeCodeForTokens(code, verifier)
            }.onSuccess { response ->
                graph.tokenStore.saveTokens(response)
                clearPendingAuth()
                val provider = graph.tokenProvider(response) { handleSessionExpired() }
                _state.value = AuthUiState.Authenticated(response.user, provider, nextSessionKey(response.user))
            }.onFailure { error ->
                clearPendingAuth()
                _state.value = AuthUiState.Error(error.message ?: "Authentication failed")
            }
        }
    }

    fun handleLoginBrowserReturn() {
        pendingCodeVerifier = pendingCodeVerifier ?: graph.tokenStore.loadPendingCodeVerifier()
        if (pendingCodeVerifier == null || _state.value !is AuthUiState.Authenticating) return
        scheduleLoginReturnFallback()
    }

    fun logout() {
        localPreviewActive = false
        loginReturnJob?.cancel()
        val tokens = graph.tokenStore.loadTokens()
        graph.tokenStore.clearTokens()
        clearPendingAuth()
        _state.value = AuthUiState.Unauthenticated()
        if (tokens != null) {
            viewModelScope.launch {
                runCatching { graph.authService.serverLogout(tokens.accessToken) }
            }
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            val tokens = graph.tokenStore.loadTokens()
            if (localPreviewActive) return@launch
            if (tokens == null) {
                _state.value = if (pendingCodeVerifier == null) {
                    AuthUiState.Unauthenticated()
                } else {
                    AuthUiState.Authenticating
                }
                if (pendingCodeVerifier != null) {
                    scheduleLoginReturnFallback()
                }
                return@launch
            }

            clearPendingAuth()
            runCatching {
                graph.authService.refreshTokens(tokens.refreshToken)
            }.onSuccess { response ->
                if (localPreviewActive) return@onSuccess
                graph.tokenStore.saveTokens(response)
                val provider = graph.tokenProvider(response) { handleSessionExpired() }
                _state.value = AuthUiState.Authenticated(response.user, provider, nextSessionKey(response.user))
            }.onFailure {
                if (localPreviewActive) return@onFailure
                graph.tokenStore.clearTokens()
                _state.value = AuthUiState.Unauthenticated(notice = SESSION_EXPIRED_NOTICE)
            }
        }
    }

    private fun handleSessionExpired() {
        localPreviewActive = false
        loginReturnJob?.cancel()
        graph.tokenStore.clearTokens()
        clearPendingAuth()
        _state.value = AuthUiState.Unauthenticated(notice = SESSION_EXPIRED_NOTICE)
    }

    private fun clearPendingAuth() {
        pendingCodeVerifier = null
        graph.tokenStore.clearPendingCodeVerifier()
    }

    private fun scheduleLoginReturnFallback() {
        loginReturnJob?.cancel()
        loginReturnJob = viewModelScope.launch {
            delay(LOGIN_CALLBACK_GRACE_MS)
            if (_state.value is AuthUiState.Authenticating) {
                clearPendingAuth()
                _state.value = AuthUiState.Unauthenticated()
            }
        }
    }

    private fun nextSessionKey(user: User): String {
        sessionCounter += 1
        return "${user.id}-$sessionCounter"
    }
}

data class ConversationGroup(
    val label: String,
    val conversations: List<Conversation>,
)

data class ConversationListState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val dustUser: DustUser? = null,
    val workspace: Workspace? = null,
    val workspaces: List<Workspace> = emptyList(),
    val conversations: List<Conversation> = emptyList(),
    val pods: List<Space> = emptyList(),
    val isPodsExpanded: Boolean = true,
    val searchText: String = "",
) {
    val unreadConversations: List<Conversation>
        get() = conversations.filter { it.unread || it.actionRequired }

    val groupedConversations: List<ConversationGroup>
        get() {
            val filtered = conversations.filteredByTitleSearch(searchText)
            val inboxIds = unreadConversations.map { it.sId }.toSet()
            val inbox = filtered.filter { it.sId in inboxIds }
            val dateGroups = groupByDate(filtered)
            return buildList {
                if (inbox.isNotEmpty()) add(ConversationGroup("Inbox (${inbox.size})", inbox))
                dateGroups.forEach { group ->
                    val nonInbox = group.conversations.filterNot { it.sId in inboxIds }
                    if (nonInbox.isNotEmpty()) add(group.copy(conversations = nonInbox))
                }
            }
        }
}

internal fun ConversationListState.withRefreshDataForWorkspace(
    workspaceId: String,
    data: ConversationListData,
): ConversationListState =
    if (workspace?.sId == workspaceId) {
        copy(
            isLoading = false,
            error = null,
            conversations = data.conversations,
            pods = data.pods,
        )
    } else {
        this
    }

internal fun ConversationListState.withRefreshErrorForWorkspace(
    workspaceId: String,
    error: String,
): ConversationListState =
    if (workspace?.sId == workspaceId) {
        copy(isLoading = false, error = error)
    } else {
        this
    }

class ConversationListViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationListState())
    val state: StateFlow<ConversationListState> = _state.asStateFlow()

    fun load() {
        if (isLocalPreview) {
            val dustUser = localPreviewDustUser()
            val workspace = dustUser.workspaces.first()
            val data = localPreviewConversationListData(workspace.sId)
            _state.value = ConversationListState(
                isLoading = false,
                dustUser = dustUser,
                workspace = workspace,
                workspaces = dustUser.workspaces,
                conversations = data.conversations,
                pods = data.pods,
            )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val dustUser = graph.userRepository.fetchDustUser(tokenProvider)
                val selectedWorkspaceId = dustUser.selectedWorkspace ?: dustUser.workspaces.firstOrNull()?.sId
                val workspace = dustUser.workspaces.firstOrNull { it.sId == selectedWorkspaceId }
                    ?: error("No workspace found")
                _state.update {
                    it.copy(
                        dustUser = dustUser,
                        workspaces = dustUser.workspaces,
                        workspace = workspace,
                    )
                }
                refresh()
            }.onFailure { error ->
                _state.update { it.copy(isLoading = false, error = error.message ?: "Failed to load conversations") }
            }
        }
    }

    fun refresh() {
        refresh(showError = true)
    }

    fun refreshSilently() {
        refresh(showError = false)
    }

    private fun refresh(showError: Boolean) {
        val workspaceId = _state.value.workspace?.sId ?: return
        if (isLocalPreview) {
            _state.update { it.withRefreshDataForWorkspace(workspaceId, localPreviewConversationListData(workspaceId)) }
            return
        }
        viewModelScope.launch {
            runCatching {
                loadConversationListData(
                    fetchConversations = {
                        graph.conversationRepository.fetchConversations(workspaceId, tokenProvider).conversations
                    },
                    fetchPods = {
                        graph.spaceRepository.fetchPods(workspaceId, tokenProvider)
                    },
                )
            }.onSuccess { data ->
                _state.update { it.withRefreshDataForWorkspace(workspaceId, data) }
            }.onFailure { error ->
                if (showError) {
                    _state.update {
                        it.withRefreshErrorForWorkspace(
                            workspaceId = workspaceId,
                            error = error.message ?: "Refresh failed",
                        )
                    }
                }
            }
        }
    }

    fun switchWorkspace(workspace: Workspace) {
        _state.update {
            it.copy(workspace = workspace, conversations = emptyList(), pods = emptyList(), isLoading = true)
        }
        refresh()
    }

    fun updateSearch(text: String) {
        _state.update { it.copy(searchText = text) }
    }

    fun togglePodsExpanded() {
        _state.update { it.copy(isPodsExpanded = !it.isPodsExpanded) }
    }

    fun toggleReadStatus(conversation: Conversation) {
        val workspaceId = _state.value.workspace?.sId ?: return
        val wasUnread = conversation.unread || conversation.actionRequired
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map {
                    if (it.sId == conversation.sId) {
                        it.copy(unread = !wasUnread, actionRequired = false)
                    } else {
                        it
                    }
                },
            )
        }
        viewModelScope.launch {
            if (isLocalPreview) return@launch
            runCatching {
                if (wasUnread) {
                    graph.conversationRepository.markAsRead(workspaceId, conversation.sId, tokenProvider)
                } else {
                    graph.conversationRepository.markAsUnread(workspaceId, conversation.sId, tokenProvider)
                }
            }.onFailure {
                _state.update { state ->
                    state.copy(
                        conversations = state.conversations.map {
                            if (it.sId == conversation.sId) conversation else it
                        },
                    )
                }
            }
        }
    }

    fun deleteConversation(conversation: Conversation) {
        val workspaceId = _state.value.workspace?.sId ?: return
        val snapshot = _state.value.conversations
        _state.update { it.copy(conversations = it.conversations.filterNot { item -> item.sId == conversation.sId }) }
        viewModelScope.launch {
            if (isLocalPreview) return@launch
            runCatching {
                graph.conversationRepository.deleteConversation(workspaceId, conversation.sId, tokenProvider)
            }.onFailure {
                _state.update { state -> state.copy(conversations = snapshot) }
            }
        }
    }

    fun markConversationsAsRead(conversationIds: Set<String>) {
        if (conversationIds.isEmpty()) return
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map { conversation ->
                    if (conversation.sId in conversationIds) {
                        conversation.copy(unread = false, actionRequired = false)
                    } else {
                        conversation
                    }
                },
            )
        }
    }

    fun updateConversationTitle(conversationId: String, title: String) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.withUpdatedTitle(conversationId, title),
            )
        }
    }
}

data class PodConversationsState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val searchText: String = "",
    val conversations: List<Conversation> = emptyList(),
) {
    val groupedConversations: List<ConversationGroup>
        get() {
            val filtered = conversations.filteredByTitleSearch(searchText)
            return groupByDate(filtered)
        }
}

class PodConversationsViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    private val space: Space,
) : ViewModel() {
    private val _state = MutableStateFlow(PodConversationsState())
    val state: StateFlow<PodConversationsState> = _state.asStateFlow()

    fun load() {
        if (isLocalPreview) {
            _state.value = PodConversationsState(
                isLoading = false,
                conversations = localPreviewPodConversations(workspaceId, space.sId),
            )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.conversationRepository.fetchSpaceConversations(
                    workspaceId = workspaceId,
                    spaceId = space.sId,
                    tokenProvider = tokenProvider,
                ).conversations.filter { it.preview != null }
            }.onSuccess { conversations ->
                _state.update { it.copy(isLoading = false, conversations = conversations) }
            }.onFailure { error ->
                _state.update { it.copy(isLoading = false, error = error.message ?: "Failed to load space") }
            }
        }
    }

    fun refresh() {
        load()
    }

    fun updateSearch(text: String) {
        _state.update { it.copy(searchText = text) }
    }

    fun updateConversationTitle(conversationId: String, title: String) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.withUpdatedTitle(conversationId, title),
            )
        }
    }

    fun markConversationAsRead(conversationId: String) {
        _state.update { state ->
            state.copy(
                conversations = state.conversations.map { conversation ->
                    if (conversation.sId == conversationId) {
                        conversation.copy(unread = false, actionRequired = false)
                    } else {
                        conversation
                    }
                },
            )
        }
    }
}

data class CatchUpState(
    val conversations: List<Conversation>,
    val currentIndex: Int = 0,
    val messages: List<ConversationMessage> = emptyList(),
    val markedAsReadIds: Set<String> = emptySet(),
    val isLoadingMessages: Boolean = false,
    val isFlushing: Boolean = false,
    val hasFlushed: Boolean = false,
    val error: String? = null,
) {
    val currentConversation: Conversation?
        get() = conversations.getOrNull(currentIndex)

    val isDone: Boolean
        get() = currentIndex >= conversations.size

    val progressText: String
        get() {
            if (conversations.isEmpty()) return "0 of 0"
            return "${min(currentIndex + 1, conversations.size)} of ${conversations.size}"
    }
}

internal fun CatchUpState.canStartFlush(): Boolean =
    !hasFlushed && !isFlushing && markedAsReadIds.isNotEmpty()

internal fun CatchUpState.flushStarted(): CatchUpState =
    copy(isFlushing = true, hasFlushed = true)

internal fun CatchUpState.flushSucceeded(): CatchUpState =
    copy(isFlushing = false)

internal fun CatchUpState.flushFailed(error: String): CatchUpState =
    copy(
        isFlushing = false,
        hasFlushed = false,
        error = error,
    )

class CatchUpViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    conversations: List<Conversation>,
) : ViewModel() {
    private val _state = MutableStateFlow(CatchUpState(conversations = conversations))
    val state: StateFlow<CatchUpState> = _state.asStateFlow()
    private var loadJob: Job? = null

    init {
        loadCurrentMessages()
    }

    fun loadCurrentMessages() {
        val conversation = _state.value.currentConversation ?: return
        val expectedIndex = _state.value.currentIndex
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(isLoadingMessages = true, messages = emptyList(), error = null) }
            if (isLocalPreview) {
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(
                            isLoadingMessages = false,
                            messages = localPreviewMessages(conversation.sId),
                        )
                    } else {
                        state
                    }
                }
                return@launch
            }
            runCatching {
                graph.conversationRepository.fetchMessages(
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    tokenProvider = tokenProvider,
                    limit = 10,
                ).messages.sortedWith(compareBy<ConversationMessage> { it.rank }.thenBy { it.created })
            }.onSuccess { messages ->
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(isLoadingMessages = false, messages = messages)
                    } else {
                        state
                    }
                }
            }.onFailure { error ->
                _state.update { state ->
                    if (state.currentIndex == expectedIndex) {
                        state.copy(
                            isLoadingMessages = false,
                            error = error.message ?: "Failed to load messages",
                        )
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun markAsRead() {
        val conversation = _state.value.currentConversation ?: return
        _state.update { it.copy(markedAsReadIds = it.markedAsReadIds + conversation.sId) }
        advance()
    }

    fun keepForLater() {
        advance()
    }

    fun dismiss(onDismiss: (Set<String>) -> Unit) {
        val markedIds = _state.value.markedAsReadIds
        viewModelScope.launch { flush() }
        onDismiss(markedIds)
    }

    private fun advance() {
        loadJob?.cancel()
        _state.update {
            it.copy(
                currentIndex = it.currentIndex + 1,
                messages = emptyList(),
                isLoadingMessages = false,
                error = null,
            )
        }
        if (_state.value.isDone) {
            viewModelScope.launch { flush() }
        } else {
            loadCurrentMessages()
        }
    }

    private suspend fun flush() {
        val state = _state.value
        if (!state.canStartFlush()) return
        if (isLocalPreview) {
            _state.update { it.flushSucceeded().copy(hasFlushed = true) }
            return
        }
        _state.update { it.flushStarted() }
        runCatching {
            graph.conversationRepository.bulkMarkAsRead(
                workspaceId = workspaceId,
                conversationIds = state.markedAsReadIds.toList(),
                tokenProvider = tokenProvider,
            )
        }.onSuccess {
            _state.update { it.flushSucceeded() }
        }.onFailure { error ->
            _state.update {
                it.flushFailed(error.message ?: "Failed to mark conversations as read")
            }
        }
    }
}

data class ConversationDetailState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val conversationTitle: String? = null,
    val messages: List<ConversationMessage> = emptyList(),
    val hasMore: Boolean = false,
    val lastValue: Int? = null,
    val isLoadingMore: Boolean = false,
    val blockedState: BlockedState? = null,
    val actionError: String? = null,
    val isValidatingAction: Boolean = false,
    val streamingMessageId: String? = null,
    val streamingActivity: AgentMessageStream.Activity = AgentMessageStream.Activity.THINKING,
    val activeActions: List<ActiveAction> = emptyList(),
    val completedSteps: List<ActivityStep> = emptyList(),
    val lastError: ErrorInfo? = null,
    val replyText: String = "",
    val agents: List<LightAgentConfiguration> = emptyList(),
    val selectedReplyAgent: LightAgentConfiguration? = null,
    val shouldOpenAgentPicker: Boolean = false,
    val availableCapabilities: List<Capability> = emptyList(),
    val selectedCapabilities: List<Capability> = emptyList(),
    val knowledgeQuery: String = "",
    val knowledgeResults: List<KnowledgeItem> = emptyList(),
    val selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    val isSearchingKnowledge: Boolean = false,
    val attachments: List<AttachmentDraft> = emptyList(),
    val isSending: Boolean = false,
) {
    val canSendReply: Boolean
        get() = canSendMessage(
            text = replyText,
            hasAttachments = attachments.isNotEmpty(),
            hasFailedUploads = attachments.hasFailedUploads,
            isSending = isSending,
        )
}

private fun ConversationDetailState.withMessages(messages: List<ConversationMessage>): ConversationDetailState =
    copy(
        messages = messages,
        selectedReplyAgent = retargetReplyAgentForMessages(
            previousMessages = this.messages,
            nextMessages = messages,
            agents = agents,
            selectedAgent = selectedReplyAgent,
        ),
    )

internal fun ConversationDetailState.shouldHandleAgentMessageDone(messageId: String): Boolean =
    streamingMessageId == messageId ||
        messages.any { message ->
            message is ConversationMessage.Agent &&
                message.message.sId == messageId &&
                message.message.isStreaming
        }

internal fun ConversationDetailState.withAppliedStreamSnapshot(
    messageId: String,
    snapshot: AgentMessageStream.Snapshot,
): ConversationDetailState =
    copy(
        messages = messages.map { item ->
            if (item !is ConversationMessage.Agent || item.message.sId != messageId) {
                item
            } else {
                item.copy(
                    message = item.message.copy(
                        content = if (snapshot.content.isEmpty()) item.message.content else snapshot.content,
                        chainOfThought = if (snapshot.isFinished || snapshot.chainOfThought != null) {
                            snapshot.chainOfThought
                        } else {
                            item.message.chainOfThought
                        },
                        status = snapshot.status ?: item.message.status,
                        generatedFiles = snapshot.generatedFiles ?: item.message.generatedFiles,
                        citations = snapshot.citations ?: item.message.citations,
                    ),
                )
            }
        },
        streamingMessageId = messageId,
        streamingActivity = snapshot.activity,
        activeActions = snapshot.activeActions,
        completedSteps = snapshot.completedSteps,
        lastError = snapshot.error ?: if (snapshot.status == null) {
            lastError
        } else {
            lastError?.takeUnless { it.messageId == messageId }
        },
    )

internal fun ConversationDetailState.withClearedLiveStream(): ConversationDetailState =
    copy(
        blockedState = null,
        streamingMessageId = null,
        streamingActivity = AgentMessageStream.Activity.THINKING,
        activeActions = emptyList(),
        completedSteps = emptyList(),
    )

internal fun fallbackAgentMessageDoneStatus(status: String): AgentMessageStatus? =
    if (status == "error") AgentMessageStatus.FAILED else null

internal fun shouldMarkConversationAsReadOnOpen(conversation: Conversation): Boolean =
    conversation.unread || conversation.actionRequired

class ConversationDetailViewModel(
    val graph: AppGraph,
    val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    val workspaceId: String,
    private val conversation: Conversation,
    private val user: User,
    private val currentUserSId: String?,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationDetailState(conversationTitle = conversation.title))
    val state: StateFlow<ConversationDetailState> = _state.asStateFlow()
    private var streamJob: Job? = null
    private var conversationEventsJob: Job? = null
    private var optimisticUserMessageId: String? = null
    private var replyKnowledgeSearchJob: Job? = null
    private val speechInput = SpeechInputHandler(
        graph,
        tokenProvider,
        workspaceId,
        viewModelScope,
        isLocalPreview,
    )
    val speechState: StateFlow<SpeechInputState> = speechInput.state
    private val attachmentUploadJobs = mutableMapOf<String, Job>()
    private val contentFragmentImageCache = object : LruCache<String, ByteArray>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
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
            _state.value = ConversationDetailState(conversationTitle = conversation.title)
                .withMessages(messages)
                .copy(
                    isLoading = false,
                    agents = agents,
                    selectedReplyAgent = agents.firstOrNull(),
                    availableCapabilities = localPreviewCapabilities(workspaceId),
                )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.conversationRepository.fetchMessages(workspaceId, conversation.sId, tokenProvider)
            }.onSuccess { messages ->
                val sortedMessages = messages.messages.sortedByRank()
                _state.update { state ->
                    state.withMessages(sortedMessages).copy(
                        isLoading = false,
                        hasMore = messages.hasMore,
                        lastValue = messages.lastValue,
                        lastError = null,
                    )
                }
                attachToStreamingMessage(sortedMessages)
                loadReplyAgents(sortedMessages)
                loadReplyCapabilities()
                startConversationEvents()
                reconcileBlockedActions()
                markAsRead()
            }.onFailure { error ->
                _state.update { it.copy(isLoading = false, error = error.message ?: "Failed to load messages") }
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
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(isLoadingMore = false, error = error.message ?: "Failed to load more messages")
                }
            }
        }
    }

    fun updateReply(text: String) {
        _state.update {
            it.copy(
                replyText = text,
                shouldOpenAgentPicker = shouldOpenAgentPicker(text),
            )
        }
    }

    fun selectReplyAgent(agent: LightAgentConfiguration) {
        _state.update {
            it.copy(
                replyText = removeTrailingAgentPickerTrigger(it.replyText),
                selectedReplyAgent = agent,
                shouldOpenAgentPicker = false,
            )
        }
    }

    fun dismissReplyAgentPicker() {
        _state.update { it.copy(shouldOpenAgentPicker = false) }
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

    fun updateReplyKnowledgeQuery(query: String) {
        _state.update { it.copy(knowledgeQuery = query) }
        replyKnowledgeSearchJob?.cancel()
        if (query.length < 2) {
            _state.update { it.copy(knowledgeResults = emptyList(), isSearchingKnowledge = false) }
            return
        }
        if (isLocalPreview) {
            _state.update {
                it.copy(
                    knowledgeResults = localPreviewKnowledgeItems(query),
                    isSearchingKnowledge = false,
                )
            }
            return
        }
        replyKnowledgeSearchJob = viewModelScope.launch {
            _state.update { it.copy(isSearchingKnowledge = true) }
            delay(KNOWLEDGE_SEARCH_DEBOUNCE_MS)
            try {
                val results = graph.capabilityRepository.searchKnowledge(workspaceId, query, tokenProvider)
                    .nodes
                    .mapNotNull { it.toKnowledgeItem() }
                _state.update { state ->
                    if (state.knowledgeQuery == query) {
                        state.copy(knowledgeResults = results, isSearchingKnowledge = false)
                    } else {
                        state
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update { state ->
                    if (state.knowledgeQuery == query) {
                        state.copy(
                            isSearchingKnowledge = false,
                            actionError = error.message ?: "Knowledge search failed",
                        )
                    } else {
                        state
                    }
                }
            }
        }
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
        val attachment = AttachmentDraft(
            fileName = fileName,
            contentType = contentType,
            fileSize = data.size,
            data = data,
            thumbnailData = thumbnailData,
        )
        _state.update { it.copy(attachments = it.attachments + attachment) }
        startAttachmentUpload(attachment)
    }

    fun removeAttachment(id: String) {
        attachmentUploadJobs.remove(id)?.cancel()
        _state.update { it.copy(attachments = it.attachments.filterNot { attachment -> attachment.id == id }) }
    }

    fun cancelAttachmentUploads() {
        val canceledAttachmentIds = attachmentUploadJobs.keys.toSet()
        attachmentUploadJobs.values.forEach { it.cancel() }
        attachmentUploadJobs.clear()
        if (canceledAttachmentIds.isNotEmpty()) {
            _state.update { state ->
                state.copy(attachments = state.attachments.markUploadsCanceled(canceledAttachmentIds))
            }
        }
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

    fun resyncOnForeground() {
        if (_state.value.blockedState == null) return
        viewModelScope.launch {
            if (refreshBlockedActions()) {
                load()
            }
        }
    }

    fun sendReply() {
        val state = _state.value
        val text = state.replyText.trim()
        if (!state.canSendReply) return
        if (text.isNotEmpty()) {
            addOptimisticUserMessage(text)
        }
        if (isLocalPreview) {
            viewModelScope.launch {
                _state.update { it.copy(isSending = true, error = null) }
                delay(350)
                removeOptimisticUserMessage()
                val nextRank = (_state.value.messages.maxOfOrNull { it.rank } ?: 0) + 1
                val previewMessages = localPreviewReplyMessages(
                    text = text,
                    user = user,
                    startRank = nextRank,
                    conversationId = conversation.sId,
                )
                _state.update { detailState ->
                    detailState.withMessages(detailState.messages + previewMessages).copy(
                        replyText = "",
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
            _state.update { it.copy(isSending = true, error = null) }
            runCatching {
                val uploaded = awaitUploadedAttachments()
                replyContentFragmentPayloads(
                    uploadedAttachments = uploaded,
                    profilePictureUrl = user.profilePictureUrl,
                ).forEach { payload ->
                    graph.fileRepository.postContentFragment(
                        workspaceId = workspaceId,
                        conversationId = conversation.sId,
                        payload = payload,
                        tokenProvider = tokenProvider,
                    )
                }
                graph.conversationRepository.postMessage(
                    workspaceId = workspaceId,
                    conversationId = conversation.sId,
                    request = PostMessageRequest(
                        content = contentWithSkillTags(text, state.selectedCapabilities),
                        mentions = listOf(
                            MentionPayload(state.selectedReplyAgent?.sId ?: replyAgentConfigurationId(state.messages)),
                        ),
                        context = buildMessageContext(state.selectedCapabilities, user.profilePictureUrl),
                    ),
                    tokenProvider = tokenProvider,
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        replyText = "",
                        selectedCapabilities = emptyList(),
                        selectedKnowledgeItems = emptyList(),
                        knowledgeQuery = "",
                        knowledgeResults = emptyList(),
                        isSearchingKnowledge = false,
                        attachments = emptyList(),
                        isSending = false,
                    )
                }
                load()
            }.onFailure { error ->
                removeOptimisticUserMessage()
                _state.update { it.copy(isSending = false, error = error.message ?: "Failed to send reply") }
            }
        }
    }

    override fun onCleared() {
        streamJob?.cancel()
        conversationEventsJob?.cancel()
        replyKnowledgeSearchJob?.cancel()
        cancelAttachmentUploads()
        speechInput.cancel()
        super.onCleared()
    }

    private fun startAttachmentUpload(attachment: AttachmentDraft) {
        if (isLocalPreview) {
            _state.update { it.copy(attachments = it.attachments.replaceAttachment(attachment.markUploaded("local-file-${attachment.id}"))) }
            return
        }
        attachmentUploadJobs[attachment.id]?.cancel()
        attachmentUploadJobs[attachment.id] = viewModelScope.launch {
            try {
                uploadAttachmentDraft(
                    graph = graph,
                    tokenProvider = tokenProvider,
                    workspaceId = workspaceId,
                    attachment = attachment,
                ) { updated ->
                    _state.update { it.copy(attachments = it.attachments.replaceAttachment(updated)) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // The failed state is already reflected on the attachment.
            } finally {
                attachmentUploadJobs.remove(attachment.id)
            }
        }
    }

    private suspend fun awaitUploadedAttachments(): List<UploadedAttachment> {
        attachmentUploadJobs.values.toList().forEach { it.join() }
        _state.value.attachments
            .filter { it.uploadState is AttachmentUploadState.Pending }
            .forEach { attachment ->
                uploadAttachmentDraft(
                    graph = graph,
                    tokenProvider = tokenProvider,
                    workspaceId = workspaceId,
                    attachment = attachment,
                ) { updated ->
                    _state.update { it.copy(attachments = it.attachments.replaceAttachment(updated)) }
                }
            }
        _state.value.attachments.failedUploadMessage()?.let { throw IllegalStateException(it) }
        return _state.value.attachments.uploadedAttachments()
    }

    private fun loadReplyAgents(messages: List<ConversationMessage>) {
        if (isLocalPreview) return
        viewModelScope.launch {
            runCatching {
                graph.agentRepository.fetchAgents(workspaceId, tokenProvider)
                    .let(::sortAgentsForPicker)
            }.onSuccess { agents ->
                val currentAgentId = replyAgentConfigurationId(messages)
                _state.update { state ->
                    state.copy(
                        agents = agents,
                        selectedReplyAgent = state.selectedReplyAgent
                            ?: agents.firstOrNull { it.sId == currentAgentId }
                            ?: agents.firstOrNull { it.sId == DEFAULT_AGENT_CONFIGURATION_ID }
                            ?: agents.firstOrNull(),
                    )
                }
            }
        }
    }

    private fun loadReplyCapabilities() {
        if (isLocalPreview) return
        viewModelScope.launch {
            runCatching {
                val skills = async {
                    graph.capabilityRepository.fetchSkills(workspaceId, tokenProvider)
                }
                val spaces = graph.spaceRepository.fetchGlobalSpaces(workspaceId, tokenProvider)
                val tools = graph.capabilityRepository.fetchMcpServerViews(
                    workspaceId = workspaceId,
                    spaceIds = spaces.map { it.sId },
                    tokenProvider = tokenProvider,
                )
                val capabilities = tools.map { Capability.Tool(it) } +
                    skills.await().map { Capability.SkillCapability(it) }
                capabilities.sortedBy { it.sortKey }
            }.onSuccess { capabilities ->
                _state.update { it.copy(availableCapabilities = capabilities) }
            }
        }
    }

    private fun startConversationEvents() {
        if (isLocalPreview) return
        conversationEventsJob?.cancel()
        conversationEventsJob = viewModelScope.launch {
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
                        handleConversationEvent(envelope.data)
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

    private suspend fun handleConversationEvent(event: ConversationEventData) {
        when (event) {
            is ConversationEventData.AgentMessageNew -> {
                val message = ConversationMessage.Agent(event.event.message)
                insertMessageIfNew(message)
                if (event.event.message.isStreaming) {
                    attachToStreamingMessage(listOf(message))
                }
            }
            is ConversationEventData.AgentMessageDone -> handleAgentMessageDone(event.event)
            is ConversationEventData.UserMessageNew -> {
                removeOptimisticUserMessage()
                insertMessageIfNew(ConversationMessage.User(event.event.message))
            }
            is ConversationEventData.UserMessagePromoted -> promoteUserMessage(event.event.messageId)
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
        updateAgentMessageStatus(event.messageId, event.status)
        runCatching {
            graph.conversationRepository.fetchMessage(
                workspaceId = workspaceId,
                conversationId = event.conversationId,
                messageId = event.messageId,
                tokenProvider = tokenProvider,
            )
        }.onSuccess { message ->
            upsertMessage(message)
        }
        if (wasCurrentStream) {
            _state.update { it.withClearedLiveStream() }
        }
    }

    private fun addOptimisticUserMessage(content: String) {
        removeOptimisticUserMessage()
        val message = optimisticUserMessage(
            content = content,
            user = user,
            messages = _state.value.messages,
        )
        optimisticUserMessageId = message.id
        insertMessageIfNew(message)
    }

    private fun removeOptimisticUserMessage() {
        val id = optimisticUserMessageId ?: return
        optimisticUserMessageId = null
        _state.update { state ->
            state.copy(messages = state.messages.filterNot { it.id == id })
        }
    }

    private fun insertMessageIfNew(message: ConversationMessage) {
        _state.update { state ->
            if (state.messages.any { it.id == message.id }) {
                state
            } else {
                state.withMessages((state.messages + message).sortedByRank())
            }
        }
    }

    private fun upsertMessage(message: ConversationMessage) {
        _state.update { state ->
            state.withMessages(
                (state.messages.filterNot { it.id == message.id } + message).sortedByRank(),
            )
        }
    }

    private fun updateAgentMessageStatus(messageId: String, status: String) {
        val parsed = fallbackAgentMessageDoneStatus(status) ?: return
        _state.update { state ->
            state.copy(
                messages = state.messages.map { item ->
                    if (item is ConversationMessage.Agent && item.message.sId == messageId) {
                        item.copy(message = item.message.copy(status = parsed))
                    } else {
                        item
                    }
                },
            )
        }
    }

    private fun promoteUserMessage(messageId: String) {
        _state.update { state ->
            state.copy(
                messages = state.messages.map { item ->
                    if (item is ConversationMessage.User && item.message.sId == messageId) {
                        item.copy(message = item.message.copy(visibility = "visible"))
                    } else {
                        item
                    }
                },
            )
        }
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

    private fun attachToStreamingMessage(messages: List<ConversationMessage>) {
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
                    streamingActivity = AgentMessageStream.Activity.THINKING,
                    activeActions = emptyList(),
                    completedSteps = emptyList(),
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

        upsertMessage(message)
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
        if (!canRespondToBlockedAction(info.triggeringUserId, currentUserSId)) return
        viewModelScope.launch {
            _state.update { it.copy(isValidatingAction = true, actionError = null) }
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
        if (!canRespondToBlockedAction(info.triggeringUserId, currentUserSId)) return
        viewModelScope.launch {
            _state.update { it.copy(isValidatingAction = true, actionError = null) }
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

    private fun reconcileBlockedActions() {
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
}

data class ComposeState(
    val text: String = "",
    val agents: List<LightAgentConfiguration> = emptyList(),
    val selectedAgent: LightAgentConfiguration? = null,
    val shouldOpenAgentPicker: Boolean = false,
    val availableCapabilities: List<Capability> = emptyList(),
    val selectedCapabilities: List<Capability> = emptyList(),
    val knowledgeQuery: String = "",
    val knowledgeResults: List<KnowledgeItem> = emptyList(),
    val selectedKnowledgeItems: List<KnowledgeItem> = emptyList(),
    val attachments: List<AttachmentDraft> = emptyList(),
    val isLoadingOptions: Boolean = false,
    val isSearchingKnowledge: Boolean = false,
    val isSending: Boolean = false,
    val error: String? = null,
) {
    val canSend: Boolean
        get() = canSendMessage(
            text = text,
            hasAttachments = attachments.isNotEmpty(),
            hasFailedUploads = attachments.hasFailedUploads,
            isSending = isSending,
        )
}

internal fun ComposeState.clearedDraft(): ComposeState =
    copy(
        text = "",
        selectedAgent = agents.firstOrNull { agent -> agent.sId == DEFAULT_AGENT_CONFIGURATION_ID }
            ?: agents.firstOrNull(),
        shouldOpenAgentPicker = false,
        selectedCapabilities = emptyList(),
        knowledgeQuery = "",
        knowledgeResults = emptyList(),
        selectedKnowledgeItems = emptyList(),
        attachments = emptyList(),
        isSearchingKnowledge = false,
        isSending = false,
        error = null,
    )

internal fun ComposeState.sentSuccessfully(): ComposeState =
    copy(
        text = "",
        shouldOpenAgentPicker = false,
        selectedCapabilities = emptyList(),
        knowledgeQuery = "",
        knowledgeResults = emptyList(),
        selectedKnowledgeItems = emptyList(),
        attachments = emptyList(),
        isSearchingKnowledge = false,
        isSending = false,
        error = null,
    )

class ComposeViewModel(
    val graph: AppGraph,
    val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    val workspaceId: String,
    private val user: User,
    private val spaceId: String? = null,
) : ViewModel() {
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
    private var knowledgeSearchJob: Job? = null
    private val attachmentUploadJobs = mutableMapOf<String, Job>()

    init {
        loadOptions()
    }

    fun updateText(text: String) {
        _state.update {
            it.copy(
                text = text,
                shouldOpenAgentPicker = shouldOpenAgentPicker(text),
            )
        }
    }

    fun selectAgent(agent: LightAgentConfiguration) {
        _state.update {
            it.copy(
                text = removeTrailingAgentPickerTrigger(it.text),
                selectedAgent = agent,
                shouldOpenAgentPicker = false,
            )
        }
    }

    fun dismissAgentPicker() {
        _state.update { it.copy(shouldOpenAgentPicker = false) }
    }

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

    fun updateKnowledgeQuery(query: String) {
        _state.update { it.copy(knowledgeQuery = query) }
        knowledgeSearchJob?.cancel()
        if (query.length < 2) {
            _state.update { it.copy(knowledgeResults = emptyList(), isSearchingKnowledge = false) }
            return
        }
        if (isLocalPreview) {
            _state.update {
                it.copy(
                    knowledgeResults = localPreviewKnowledgeItems(query),
                    isSearchingKnowledge = false,
                )
            }
            return
        }
        knowledgeSearchJob = viewModelScope.launch {
            _state.update { it.copy(isSearchingKnowledge = true) }
            delay(KNOWLEDGE_SEARCH_DEBOUNCE_MS)
            try {
                val results = graph.capabilityRepository.searchKnowledge(workspaceId, query, tokenProvider)
                    .nodes
                    .mapNotNull { it.toKnowledgeItem() }
                _state.update { state ->
                    if (state.knowledgeQuery == query) {
                        state.copy(knowledgeResults = results, isSearchingKnowledge = false)
                    } else {
                        state
                    }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                _state.update { state ->
                    if (state.knowledgeQuery == query) {
                        state.copy(
                            isSearchingKnowledge = false,
                            error = error.message ?: "Knowledge search failed",
                        )
                    } else {
                        state
                    }
                }
            }
        }
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
        val attachment = AttachmentDraft(
            fileName = fileName,
            contentType = contentType,
            fileSize = data.size,
            data = data,
            thumbnailData = thumbnailData,
        )
        _state.update { it.copy(attachments = it.attachments + attachment) }
        startAttachmentUpload(attachment)
    }

    fun removeAttachment(id: String) {
        attachmentUploadJobs.remove(id)?.cancel()
        _state.update { it.copy(attachments = it.attachments.filterNot { attachment -> attachment.id == id }) }
    }

    fun cancelAttachmentUploads() {
        val canceledAttachmentIds = attachmentUploadJobs.keys.toSet()
        attachmentUploadJobs.values.forEach { it.cancel() }
        attachmentUploadJobs.clear()
        if (canceledAttachmentIds.isNotEmpty()) {
            _state.update { state ->
                state.copy(attachments = state.attachments.markUploadsCanceled(canceledAttachmentIds))
            }
        }
    }

    fun discardDraft() {
        knowledgeSearchJob?.cancel()
        cancelAttachmentUploads()
        speechInput.cancel()
        _state.update { it.clearedDraft() }
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

    fun send(onCreated: (Conversation) -> Unit) {
        val sendState = _state.value
        val text = sendState.text.trim()
        if (!sendState.canSend) return
        val selectedAgentId = sendState.selectedAgent?.sId ?: DEFAULT_AGENT_CONFIGURATION_ID
        val selectedCapabilities = sendState.selectedCapabilities
        val selectedKnowledgeItems = sendState.selectedKnowledgeItems
        if (isLocalPreview) {
            viewModelScope.launch {
                _state.update { it.copy(isSending = true, error = null) }
                delay(350)
                knowledgeSearchJob?.cancel()
                knowledgeSearchJob = null
                _state.update { it.sentSuccessfully() }
                onCreated(
                    localPreviewConversationFromDraft(
                        text = text,
                        agentId = selectedAgentId,
                        capabilities = selectedCapabilities,
                        knowledgeItems = selectedKnowledgeItems,
                        spaceId = spaceId,
                    ),
                )
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSending = true, error = null) }
            runCatching {
                val uploadedAttachments = awaitUploadedAttachments()
                val context = ContentFragmentContext(profilePictureUrl = user.profilePictureUrl)
                graph.conversationRepository.createConversation(
                    workspaceId = workspaceId,
                    request = CreateConversationRequest(
                        spaceId = spaceId,
                        message = CreateMessagePayload(
                            content = contentWithSkillTags(text, selectedCapabilities),
                            mentions = listOf(MentionPayload(selectedAgentId)),
                            context = buildMessageContext(selectedCapabilities),
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
                    ),
                    tokenProvider = tokenProvider,
                )
            }.onSuccess { conversation ->
                knowledgeSearchJob?.cancel()
                knowledgeSearchJob = null
                _state.update { it.sentSuccessfully() }
                onCreated(conversation)
            }.onFailure { error ->
                _state.update { it.copy(isSending = false, error = error.message ?: "Failed to send message") }
            }
        }
    }

    override fun onCleared() {
        knowledgeSearchJob?.cancel()
        discardDraft()
        super.onCleared()
    }

    private fun startAttachmentUpload(attachment: AttachmentDraft) {
        if (isLocalPreview) {
            _state.update { it.copy(attachments = it.attachments.replaceAttachment(attachment.markUploaded("local-file-${attachment.id}"))) }
            return
        }
        attachmentUploadJobs[attachment.id]?.cancel()
        attachmentUploadJobs[attachment.id] = viewModelScope.launch {
            try {
                uploadAttachmentDraft(
                    graph = graph,
                    tokenProvider = tokenProvider,
                    workspaceId = workspaceId,
                    attachment = attachment,
                ) { updated ->
                    _state.update { it.copy(attachments = it.attachments.replaceAttachment(updated)) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // The failed state is already reflected on the attachment.
            } finally {
                attachmentUploadJobs.remove(attachment.id)
            }
        }
    }

    private suspend fun awaitUploadedAttachments(): List<UploadedAttachment> {
        attachmentUploadJobs.values.toList().forEach { it.join() }
        _state.value.attachments
            .filter { it.uploadState is AttachmentUploadState.Pending }
            .forEach { attachment ->
                uploadAttachmentDraft(
                    graph = graph,
                    tokenProvider = tokenProvider,
                    workspaceId = workspaceId,
                    attachment = attachment,
                ) { updated ->
                    _state.update { it.copy(attachments = it.attachments.replaceAttachment(updated)) }
                }
            }
        _state.value.attachments.failedUploadMessage()?.let { throw IllegalStateException(it) }
        return _state.value.attachments.uploadedAttachments()
    }

    private fun loadOptions() {
        if (isLocalPreview) {
            val agents = localPreviewAgents()
            _state.update {
                it.copy(
                    agents = agents,
                    selectedAgent = agents.firstOrNull(),
                    availableCapabilities = localPreviewCapabilities(workspaceId),
                    isLoadingOptions = false,
                )
            }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoadingOptions = true) }
            runCatching {
                val agents = async {
                    sortAgentsForPicker(graph.agentRepository.fetchAgents(workspaceId, tokenProvider))
                }
                val skills = async {
                    graph.capabilityRepository.fetchSkills(workspaceId, tokenProvider)
                }
                val spaces = async {
                    graph.spaceRepository.fetchGlobalSpaces(workspaceId, tokenProvider)
                }
                val resolvedAgents = agents.await()
                val globalSpaces = spaces.await()
                val tools = graph.capabilityRepository.fetchMcpServerViews(
                    workspaceId = workspaceId,
                    spaceIds = globalSpaces.map { it.sId },
                    tokenProvider = tokenProvider,
                )
                val capabilities = tools.map { Capability.Tool(it) } +
                    skills.await().map { Capability.SkillCapability(it) }
                resolvedAgents to capabilities.sortedBy { it.sortKey }
            }.onSuccess { (agents, capabilities) ->
                _state.update {
                    it.copy(
                        agents = agents,
                        selectedAgent = agents.firstOrNull { agent -> agent.sId == DEFAULT_AGENT_CONFIGURATION_ID }
                            ?: agents.firstOrNull(),
                        availableCapabilities = capabilities,
                        isLoadingOptions = false,
                    )
                }
            }.onFailure { error ->
                _state.update {
                    it.copy(
                        isLoadingOptions = false,
                        error = error.message ?: "Failed to load input options",
                    )
                }
            }
        }
    }

    private fun buildMessageContext(capabilities: List<Capability>): MessageContext {
        return buildMessageContext(capabilities, user.profilePictureUrl)
    }
}

data class ConversationFilesState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val attachments: List<ConversationAttachment> = emptyList(),
)

class ConversationFilesViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    private val conversationId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(ConversationFilesState())
    val state: StateFlow<ConversationFilesState> = _state.asStateFlow()

    fun load() {
        if (isLocalPreview) {
            _state.value = ConversationFilesState(
                isLoading = false,
                attachments = localPreviewAttachments(conversationId),
            )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.fileRepository.fetchAttachments(workspaceId, conversationId, tokenProvider)
            }.onSuccess { attachments ->
                _state.update { it.copy(isLoading = false, attachments = attachments) }
            }.onFailure { error ->
                _state.update {
                    it.copy(isLoading = false, error = error.message ?: "Failed to load files")
                }
            }
        }
    }
}

data class AttachmentViewerState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val data: ByteArray? = null,
) {
    override fun equals(other: Any?): Boolean =
        other is AttachmentViewerState &&
            isLoading == other.isLoading &&
            error == other.error &&
            ((data == null && other.data == null) ||
                (data != null && other.data != null && data.contentEquals(other.data)))

    override fun hashCode(): Int {
        var result = isLoading.hashCode()
        result = 31 * result + (error?.hashCode() ?: 0)
        result = 31 * result + (data?.contentHashCode() ?: 0)
        return result
    }
}

class AttachmentViewerViewModel(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean = false,
    private val workspaceId: String,
    private val fileId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(AttachmentViewerState())
    val state: StateFlow<AttachmentViewerState> = _state.asStateFlow()

    fun load() {
        if (isLocalPreview) {
            _state.value = AttachmentViewerState(
                isLoading = false,
                data = localPreviewFileData(fileId),
            )
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            runCatching {
                graph.fileRepository.fetchFileData(workspaceId, fileId, tokenProvider)
            }.onSuccess { data ->
                _state.update { it.copy(isLoading = false, data = data) }
            }.onFailure { error ->
                _state.update {
                    it.copy(isLoading = false, error = error.message ?: "Failed to load file")
                }
            }
        }
    }
}

data class AttachmentDraft(
    val id: String = UUID.randomUUID().toString(),
    val fileName: String,
    val contentType: String,
    val fileSize: Int,
    val data: ByteArray,
    val thumbnailData: ByteArray? = null,
    val uploadState: AttachmentUploadState = AttachmentUploadState.Pending,
) {
    val fileId: String?
        get() = (uploadState as? AttachmentUploadState.Uploaded)?.fileId

    val thumbnailSourceData: ByteArray?
        get() = thumbnailData ?: data.takeIf { it.isNotEmpty() }

    override fun equals(other: Any?): Boolean =
        other is AttachmentDraft &&
            id == other.id &&
            fileName == other.fileName &&
            contentType == other.contentType &&
            fileSize == other.fileSize &&
            data.contentEquals(other.data) &&
            thumbnailData.contentEqualsNullable(other.thumbnailData) &&
            uploadState == other.uploadState

    override fun hashCode(): Int {
        var result = id.hashCode()
        result = 31 * result + fileName.hashCode()
        result = 31 * result + contentType.hashCode()
        result = 31 * result + fileSize
        result = 31 * result + data.contentHashCode()
        result = 31 * result + (thumbnailData?.contentHashCode() ?: 0)
        result = 31 * result + uploadState.hashCode()
        return result
    }
}

sealed interface AttachmentUploadState {
    data object Pending : AttachmentUploadState
    data object Uploading : AttachmentUploadState
    data class Uploaded(val fileId: String) : AttachmentUploadState
    data class Failed(val message: String) : AttachmentUploadState
}

private val List<AttachmentDraft>.hasFailedUploads: Boolean
    get() = any { it.uploadState is AttachmentUploadState.Failed }

private fun List<AttachmentDraft>.replaceAttachment(updated: AttachmentDraft): List<AttachmentDraft> =
    map { if (it.id == updated.id) updated else it }

private fun List<AttachmentDraft>.failedUploadMessage(): String? =
    firstNotNullOfOrNull { attachment ->
        (attachment.uploadState as? AttachmentUploadState.Failed)?.message
    }

private fun List<AttachmentDraft>.uploadedAttachments(): List<UploadedAttachment> =
    mapNotNull { attachment ->
        attachment.fileId?.let { UploadedAttachment(fileName = attachment.fileName, fileId = it) }
    }

private suspend fun uploadAttachmentDraft(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspaceId: String,
    attachment: AttachmentDraft,
    onUpdate: (AttachmentDraft) -> Unit,
): UploadedAttachment {
    onUpdate(attachment.copy(uploadState = AttachmentUploadState.Uploading))
    return try {
        val fileId = graph.fileRepository.uploadFile(
            workspaceId = workspaceId,
            fileName = attachment.fileName,
            contentType = attachment.contentType,
            fileData = attachment.data,
            tokenProvider = tokenProvider,
        )
        onUpdate(attachment.markUploaded(fileId))
        UploadedAttachment(attachment.fileName, fileId)
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        onUpdate(attachment.copy(uploadState = AttachmentUploadState.Failed(error.message ?: "Upload failed")))
        throw error
    }
}

internal fun replyContentFragmentPayloads(
    uploadedAttachments: List<UploadedAttachment>,
    profilePictureUrl: String?,
): List<ContentFragmentPayload> {
    val context = ContentFragmentContext(profilePictureUrl = profilePictureUrl)
    return uploadedAttachments.map { attachment ->
        ContentFragmentPayload.file(
            title = attachment.fileName,
            fileId = attachment.fileId,
            context = context,
        )
    }
}

internal data class UploadedAttachment(
    val fileName: String,
    val fileId: String,
)

internal fun AttachmentDraft.markUploaded(fileId: String): AttachmentDraft =
    copy(data = ByteArray(0), uploadState = AttachmentUploadState.Uploaded(fileId))

internal fun AttachmentDraft.markUploadCanceled(): AttachmentDraft =
    when (uploadState) {
        AttachmentUploadState.Pending,
        AttachmentUploadState.Uploading -> copy(uploadState = AttachmentUploadState.Failed("Upload canceled"))
        is AttachmentUploadState.Failed,
        is AttachmentUploadState.Uploaded -> this
    }

private fun List<AttachmentDraft>.markUploadsCanceled(attachmentIds: Set<String>): List<AttachmentDraft> =
    map { attachment ->
        if (attachment.id in attachmentIds) {
            attachment.markUploadCanceled()
        } else {
            attachment
        }
    }

private fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean =
    when {
        this == null -> other == null
        other == null -> false
        else -> contentEquals(other)
    }

private fun groupByDate(conversations: List<Conversation>): List<ConversationGroup> {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now(zone)
    val buckets = linkedMapOf(
        "Today" to mutableListOf<Conversation>(),
        "Yesterday" to mutableListOf(),
        "Last Week" to mutableListOf(),
        "Last Month" to mutableListOf(),
        "Last 12 Months" to mutableListOf(),
        "Older" to mutableListOf(),
    )
    conversations.forEach { conversation ->
        val date = Instant.ofEpochMilli(conversation.effectiveEpochMs.toLong()).atZone(zone).toLocalDate()
        val label = when {
            date >= today -> "Today"
            date >= today.minusDays(1) -> "Yesterday"
            date >= today.minusDays(7) -> "Last Week"
            date >= today.minusMonths(1) -> "Last Month"
            date >= today.minusYears(1) -> "Last 12 Months"
            else -> "Older"
        }
        buckets.getValue(label).add(conversation)
    }
    return buckets.mapNotNull { (label, items) ->
        if (items.isEmpty()) null else ConversationGroup(label, items)
    }
}

private fun List<ConversationMessage>.sortedByRank(): List<ConversationMessage> =
    sortedWith(compareBy<ConversationMessage> { it.rank }.thenBy { it.created })
