package com.dust.mobile.android.audio

import android.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

internal sealed interface ScribeTranscriptEvent {
    data class Partial(val text: String) : ScribeTranscriptEvent
    data class Committed(val text: String) : ScribeTranscriptEvent
    data class Error(val message: String) : ScribeTranscriptEvent
    data object Ignored : ScribeTranscriptEvent
}

internal fun parseScribeTranscriptEvent(message: String): ScribeTranscriptEvent {
    val payload = runCatching { Json.parseToJsonElement(message).jsonObject }.getOrNull()
        ?: return ScribeTranscriptEvent.Ignored
    val messageType = payload["message_type"]?.jsonPrimitive?.contentOrNull
    val text = payload["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
    return when (messageType) {
        "partial_transcript" -> ScribeTranscriptEvent.Partial(text)
        "committed_transcript", "committed_transcript_with_timestamps" ->
            ScribeTranscriptEvent.Committed(text)
        "session_started" -> ScribeTranscriptEvent.Ignored
        else -> payload["error"]?.jsonPrimitive?.contentOrNull
            ?.let(ScribeTranscriptEvent::Error)
            ?: ScribeTranscriptEvent.Ignored
    }
}

internal fun scribeAudioMessage(audioBase64: String, commit: Boolean): String =
    buildJsonObject {
        put("message_type", "input_audio_chunk")
        put("audio_base_64", audioBase64)
        put("commit", commit)
        put("sample_rate", ScribeRealtimeClient.SAMPLE_RATE_HZ)
    }.toString()

internal fun scribeRealtimeUrl(baseUri: String, token: String): HttpUrl {
    val handshakeBaseUri = baseUri.trimEnd('/')
        .replaceFirst("wss://", "https://")
        .replaceFirst("ws://", "http://")
    return handshakeBaseUri.toHttpUrl().newBuilder()
        .addPathSegments("v1/speech-to-text/realtime")
        .addQueryParameter("model_id", "scribe_v2_realtime")
        .addQueryParameter("token", token)
        .addQueryParameter("commit_strategy", "vad")
        .addQueryParameter("audio_format", "pcm_16000")
        .build()
}

internal class ScribeRealtimeClient(
    token: String,
    baseUri: String,
    private val httpClient: OkHttpClient = sharedHttpClient,
    private val onEvent: (ScribeTranscriptEvent) -> Unit,
) {
    private val request = Request.Builder()
        .url(scribeRealtimeUrl(baseUri, token))
        .build()

    @Volatile
    private var isClosed = false
    private var webSocket: WebSocket? = null

    fun connect() {
        webSocket = httpClient.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (!isClosed) onEvent(parseScribeTranscriptEvent(text))
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (!isClosed) {
                        onEvent(ScribeTranscriptEvent.Error(t.message ?: "Transcription connection lost"))
                    }
                }
            },
        )
    }

    fun sendAudio(pcmData: ByteArray) {
        if (isClosed) return
        val base64 = Base64.encodeToString(pcmData, Base64.NO_WRAP)
        webSocket?.send(scribeAudioMessage(base64, commit = false))
    }

    fun commit() {
        if (!isClosed) webSocket?.send(scribeAudioMessage("", commit = true))
    }

    fun close() {
        isClosed = true
        webSocket?.close(1000, null)
        webSocket = null
    }

    companion object {
        const val SAMPLE_RATE_HZ = 16_000
        private val sharedHttpClient = OkHttpClient()
    }
}
