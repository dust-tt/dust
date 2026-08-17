package com.dust.mobile.android.ui.conversation.detail

import com.dust.mobile.android.audio.AndroidSpeechPlayer
import com.dust.mobile.android.audio.SpeechPlaybackEvent
import com.dust.mobile.android.ui.composer.SpeechInputState
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.messageTextForSpeech
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class ConversationVoiceSessionController(
    appContext: android.content.Context,
    private val detailState: StateFlow<ConversationDetailState>,
    private val speechState: StateFlow<SpeechInputState>,
    private val coroutineScope: CoroutineScope,
    private val startSpeechInput: () -> Unit,
    private val stopSpeechInput: () -> Unit,
    private val cancelSpeechInput: () -> Unit,
    private val sendReply: () -> Unit,
) {
    private val _state = MutableStateFlow(ConversationVoiceSessionState())
    val state: StateFlow<ConversationVoiceSessionState> = _state.asStateFlow()
    private val speechPlayer = lazy {
        AndroidSpeechPlayer(appContext) { event ->
            coroutineScope.launch { handlePlaybackEvent(event) }
        }
    }
    private var awaitingAgentAfterRank: Int? = null
    private var playbackMessageId: String? = null

    init {
        coroutineScope.launch { speechState.collect(::handleSpeechInputState) }
        coroutineScope.launch { detailState.collect(::handleConversationState) }
    }

    fun startListening() {
        val phase = _state.value.phase
        if (phase == VoiceSessionPhase.WAITING_FOR_AGENT || phase == VoiceSessionPhase.FINALIZING) return
        if (phase == VoiceSessionPhase.SPEAKING && speechPlayer.isInitialized()) {
            speechPlayer.value.stop()
        }
        cancelSpeechInput()
        _state.value = ConversationVoiceSessionState(phase = VoiceSessionPhase.CONNECTING)
        startSpeechInput()
    }

    fun stopListening() {
        if (!_state.value.isActive) return
        _state.update { it.copy(phase = VoiceSessionPhase.FINALIZING, error = null) }
        stopSpeechInput()
    }

    fun sendCurrentTurn() {
        val currentDetail = detailState.value
        if (!_state.value.isActive || speechState.value.isBusy || !currentDetail.canSendReply) return
        awaitingAgentAfterRank = currentDetail.messages.maxOfOrNull(ConversationMessage::rank) ?: 0
        playbackMessageId = null
        _state.update {
            it.copy(
                phase = VoiceSessionPhase.WAITING_FOR_AGENT,
                promptText = currentDetail.replyText.trim(),
                agentText = "",
                error = null,
            )
        }
        cancelSpeechInput()
        sendReply()
    }

    fun endSession() {
        awaitingAgentAfterRank = null
        playbackMessageId = null
        _state.value = ConversationVoiceSessionState()
        if (speechPlayer.isInitialized()) speechPlayer.value.stop()
        cancelSpeechInput()
    }

    fun permissionDenied() {
        _state.value = ConversationVoiceSessionState(
            phase = VoiceSessionPhase.ERROR,
            error = "Microphone permission denied",
        )
    }

    fun clear() {
        endSession()
        if (speechPlayer.isInitialized()) speechPlayer.value.shutdown()
    }

    private fun handleSpeechInputState(speech: SpeechInputState) {
        if (!_state.value.isActive) return
        if (_state.value.phase == VoiceSessionPhase.WAITING_FOR_AGENT ||
            _state.value.phase == VoiceSessionPhase.SPEAKING
        ) {
            return
        }
        _state.update { current ->
            when {
                speech.error != null -> current.copy(
                    phase = VoiceSessionPhase.ERROR,
                    error = speech.error,
                )
                speech.isConnecting -> current.copy(phase = VoiceSessionPhase.CONNECTING, error = null)
                speech.isRecording -> current.copy(phase = VoiceSessionPhase.LISTENING, error = null)
                speech.isFinalizing -> current.copy(phase = VoiceSessionPhase.FINALIZING, error = null)
                else -> current.copy(phase = VoiceSessionPhase.PAUSED, error = null)
            }
        }
    }

    private fun handleConversationState(detail: ConversationDetailState) {
        val baselineRank = awaitingAgentAfterRank ?: return
        if (!_state.value.isActive) return
        if (detail.blockedState != null) {
            _state.update {
                it.copy(
                    phase = VoiceSessionPhase.PAUSED,
                    error = "Continue in the conversation to review this request",
                )
            }
            return
        }
        val candidate = detail.messages
            .filterIsInstance<ConversationMessage.Agent>()
            .lastOrNull { it.rank > baselineRank }
        if (candidate == null) {
            when {
                detail.pendingOutboxId != null && detail.error != null ->
                    _state.update { it.copy(error = "Queued - waiting for a connection") }
                detail.error != null && !detail.isSending ->
                    _state.update { it.copy(phase = VoiceSessionPhase.ERROR, error = detail.error) }
            }
            return
        }

        val message = candidate.message
        _state.update { it.copy(agentText = message.content.orEmpty()) }
        if (message.status == AgentMessageStatus.CREATED || playbackMessageId == message.sId) return
        when (message.status) {
            AgentMessageStatus.SUCCEEDED, AgentMessageStatus.GRACEFULLY_STOPPED -> {
                val spokenText = messageTextForSpeech(message.content.orEmpty())
                if (spokenText.isBlank()) {
                    awaitingAgentAfterRank = null
                    _state.update {
                        it.copy(
                            phase = VoiceSessionPhase.PAUSED,
                            error = "The response is ready in the conversation",
                        )
                    }
                } else {
                    playbackMessageId = message.sId
                    _state.update { it.copy(phase = VoiceSessionPhase.SPEAKING, error = null) }
                    speechPlayer.value.speak(message.sId, spokenText)
                }
            }
            AgentMessageStatus.FAILED -> failSession("Dust could not complete this response")
            AgentMessageStatus.CANCELLED -> failSession("The response was cancelled")
            AgentMessageStatus.INTERRUPTED -> failSession("The response was interrupted")
            AgentMessageStatus.CREATED -> Unit
        }
    }

    private fun handlePlaybackEvent(event: SpeechPlaybackEvent) {
        if (!_state.value.isActive) return
        when (event) {
            is SpeechPlaybackEvent.Started -> {
                if (event.id == playbackMessageId) {
                    _state.update { it.copy(phase = VoiceSessionPhase.SPEAKING, error = null) }
                }
            }
            is SpeechPlaybackEvent.Done -> {
                if (event.id != playbackMessageId) return
                awaitingAgentAfterRank = null
                playbackMessageId = null
                _state.value = ConversationVoiceSessionState(phase = VoiceSessionPhase.CONNECTING)
                startSpeechInput()
            }
            is SpeechPlaybackEvent.Error -> failSession(event.message)
            SpeechPlaybackEvent.Interrupted -> {
                if (_state.value.phase == VoiceSessionPhase.SPEAKING) {
                    _state.update {
                        it.copy(phase = VoiceSessionPhase.PAUSED, error = "Playback interrupted")
                    }
                }
            }
        }
    }

    private fun failSession(message: String) {
        awaitingAgentAfterRank = null
        playbackMessageId = null
        _state.update { it.copy(phase = VoiceSessionPhase.ERROR, error = message) }
    }
}
