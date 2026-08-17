package com.dust.mobile.android.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

internal sealed interface SpeechPlaybackEvent {
    data class Started(val id: String) : SpeechPlaybackEvent
    data class Done(val id: String) : SpeechPlaybackEvent
    data class Error(val message: String) : SpeechPlaybackEvent
    data object Interrupted : SpeechPlaybackEvent
}

internal class AndroidSpeechPlayer(
    context: Context,
    private val onEvent: (SpeechPlaybackEvent) -> Unit,
) {
    private val audioManager = context.applicationContext.getSystemService(AudioManager::class.java)
    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(audioAttributes)
        .setOnAudioFocusChangeListener { change ->
            if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                stop()
                onEvent(SpeechPlaybackEvent.Interrupted)
            }
        }
        .build()
    private var textToSpeech: TextToSpeech? = null
    private var isReady = false
    private var pendingSpeech: PendingSpeech? = null
    private var activeSpeechId: String? = null
    private var finalChunkId: String? = null
    private var failureMessage: String? = null

    init {
        textToSpeech = TextToSpeech(context.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                configureEngine()
            } else {
                fail("Speech playback is unavailable", permanent = true)
            }
        }
    }

    fun speak(id: String, text: String) {
        failureMessage?.let {
            onEvent(SpeechPlaybackEvent.Error(it))
            return
        }
        val normalized = text.trim()
        if (normalized.isEmpty()) {
            onEvent(SpeechPlaybackEvent.Done(id))
            return
        }
        pendingSpeech = PendingSpeech(id, normalized)
        if (isReady) playPendingSpeech()
    }

    fun stop() {
        pendingSpeech = null
        activeSpeechId = null
        finalChunkId = null
        textToSpeech?.stop()
        audioManager.abandonAudioFocusRequest(audioFocusRequest)
    }

    fun shutdown() {
        stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        isReady = false
    }

    private fun configureEngine() {
        val engine = textToSpeech ?: return
        engine.setAudioAttributes(audioAttributes)
        val localeResult = engine.setLanguage(Locale.getDefault())
        if (localeResult == TextToSpeech.LANG_MISSING_DATA || localeResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            engine.setLanguage(Locale.US)
        }
        engine.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String) {
                    activeSpeechId?.let { onEvent(SpeechPlaybackEvent.Started(it)) }
                }

                override fun onDone(utteranceId: String) {
                    if (utteranceId != finalChunkId) return
                    val completedId = activeSpeechId ?: return
                    activeSpeechId = null
                    finalChunkId = null
                    audioManager.abandonAudioFocusRequest(audioFocusRequest)
                    onEvent(SpeechPlaybackEvent.Done(completedId))
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String) {
                    fail("Could not play this response")
                }

                override fun onError(utteranceId: String, errorCode: Int) {
                    fail("Could not play this response")
                }
            },
        )
        failureMessage = null
        isReady = true
        playPendingSpeech()
    }

    private fun playPendingSpeech() {
        val speech = pendingSpeech ?: return
        val engine = textToSpeech ?: return
        if (audioManager.requestAudioFocus(audioFocusRequest) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            fail("Audio is in use by another app")
            return
        }
        pendingSpeech = null
        activeSpeechId = speech.id
        val chunks = splitSpeechText(speech.text)
        finalChunkId = "${speech.id}:${chunks.lastIndex}"
        chunks.forEachIndexed { index, chunk ->
            val queueMode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            if (engine.speak(chunk, queueMode, null, "${speech.id}:$index") == TextToSpeech.ERROR) {
                fail("Could not play this response")
                return
            }
        }
    }

    private fun fail(message: String, permanent: Boolean = false) {
        if (permanent) failureMessage = message
        stop()
        onEvent(SpeechPlaybackEvent.Error(message))
    }

    private data class PendingSpeech(val id: String, val text: String)
}

internal fun splitSpeechText(text: String, maxLength: Int = 3_500): List<String> {
    require(maxLength > 0)
    val words = text.trim().split(WHITESPACE_REGEX).filter(String::isNotEmpty)
    if (words.isEmpty()) return emptyList()
    val chunks = mutableListOf<String>()
    var current = StringBuilder()
    words.forEach { word ->
        if (word.length > maxLength) {
            if (current.isNotEmpty()) {
                chunks += current.toString()
                current = StringBuilder()
            }
            chunks += word.chunked(maxLength)
        } else if (current.isEmpty()) {
            current.append(word)
        } else if (current.length + 1 + word.length <= maxLength) {
            current.append(' ').append(word)
        } else {
            chunks += current.toString()
            current = StringBuilder(word)
        }
    }
    if (current.isNotEmpty()) chunks += current.toString()
    return chunks
}

private val WHITESPACE_REGEX = Regex("\\s+")
