package com.dust.mobile.android.ui.conversation.detail

internal enum class VoiceSessionPhase {
    IDLE,
    CONNECTING,
    LISTENING,
    FINALIZING,
    WAITING_FOR_AGENT,
    SPEAKING,
    PAUSED,
    ERROR,
}

internal data class ConversationVoiceSessionState(
    val phase: VoiceSessionPhase = VoiceSessionPhase.IDLE,
    val promptText: String = "",
    val agentText: String = "",
    val error: String? = null,
) {
    val isActive: Boolean
        get() = phase != VoiceSessionPhase.IDLE

    val isWaitingForAgent: Boolean
        get() = phase == VoiceSessionPhase.WAITING_FOR_AGENT

    val isSpeaking: Boolean
        get() = phase == VoiceSessionPhase.SPEAKING

    val canStartListening: Boolean
        get() = phase != VoiceSessionPhase.WAITING_FOR_AGENT && phase != VoiceSessionPhase.FINALIZING

    val statusIsError: Boolean
        get() = phase == VoiceSessionPhase.ERROR

    val displayText: String
        get() = agentText.ifBlank { promptText }

    val statusText: String
        get() = when (phase) {
            VoiceSessionPhase.IDLE -> ""
            VoiceSessionPhase.CONNECTING -> "Connecting..."
            VoiceSessionPhase.LISTENING -> "Listening..."
            VoiceSessionPhase.FINALIZING -> "Finishing up..."
            VoiceSessionPhase.WAITING_FOR_AGENT -> error ?: "Dust is working..."
            VoiceSessionPhase.SPEAKING -> "Speaking - tap the microphone to interrupt"
            VoiceSessionPhase.PAUSED -> error ?: "Paused - send or keep speaking"
            VoiceSessionPhase.ERROR -> error ?: "Voice session stopped"
        }
}
