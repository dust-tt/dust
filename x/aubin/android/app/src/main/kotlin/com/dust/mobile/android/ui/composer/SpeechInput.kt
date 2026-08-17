package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.audio.AndroidSpeechRecorder
import com.dust.mobile.android.audio.ScribeRealtimeClient
import com.dust.mobile.android.audio.ScribeTranscriptEvent
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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

internal class SpeechInputHandler(
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
