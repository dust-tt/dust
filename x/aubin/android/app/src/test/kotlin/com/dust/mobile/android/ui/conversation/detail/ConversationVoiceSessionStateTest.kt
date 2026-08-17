package com.dust.mobile.android.ui.conversation.detail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationVoiceSessionStateTest {
    @Test
    fun `waiting state keeps prompt visible and blocks microphone restart`() {
        val state = ConversationVoiceSessionState(
            phase = VoiceSessionPhase.WAITING_FOR_AGENT,
            promptText = "Summarize the launch",
        )

        assertEquals("Summarize the launch", state.displayText)
        assertEquals("Dust is working...", state.statusText)
        assertFalse(state.canStartListening)
        assertTrue(state.isActive)
    }

    @Test
    fun `agent response replaces prompt while speaking`() {
        val state = ConversationVoiceSessionState(
            phase = VoiceSessionPhase.SPEAKING,
            promptText = "Question",
            agentText = "Answer",
        )

        assertEquals("Answer", state.displayText)
        assertEquals("Speaking - tap the microphone to interrupt", state.statusText)
        assertTrue(state.isSpeaking)
        assertTrue(state.canStartListening)
    }

    @Test
    fun `paused state explains both available next actions`() {
        val state = ConversationVoiceSessionState(phase = VoiceSessionPhase.PAUSED)

        assertEquals("Paused - send or keep speaking", state.statusText)
        assertTrue(state.canStartListening)
    }
}
