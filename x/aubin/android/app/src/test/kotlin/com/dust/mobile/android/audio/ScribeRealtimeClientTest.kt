package com.dust.mobile.android.audio

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class ScribeRealtimeClientTest {
    @Test
    fun `parses partial and committed transcripts`() {
        assertEquals(
            ScribeTranscriptEvent.Partial("hel"),
            parseScribeTranscriptEvent("""{"message_type":"partial_transcript","text":"hel"}"""),
        )
        assertEquals(
            ScribeTranscriptEvent.Committed("hello"),
            parseScribeTranscriptEvent(
                """{"message_type":"committed_transcript_with_timestamps","text":"hello"}""",
            ),
        )
    }

    @Test
    fun `surfaces scribe errors`() {
        assertEquals(
            ScribeTranscriptEvent.Error("Token expired"),
            parseScribeTranscriptEvent("""{"message_type":"auth_error","error":"Token expired"}"""),
        )
    }

    @Test
    fun `builds pcm input and commit messages`() {
        val audio = Json.parseToJsonElement(scribeAudioMessage("YWJj", commit = false)).jsonObject
        val commit = Json.parseToJsonElement(scribeAudioMessage("", commit = true)).jsonObject

        assertEquals("input_audio_chunk", audio.getValue("message_type").jsonPrimitive.content)
        assertEquals("YWJj", audio.getValue("audio_base_64").jsonPrimitive.content)
        assertEquals(false, audio.getValue("commit").jsonPrimitive.boolean)
        assertEquals(16_000, audio.getValue("sample_rate").jsonPrimitive.int)
        assertEquals(true, commit.getValue("commit").jsonPrimitive.boolean)
    }

    @Test
    fun `builds realtime handshake URL from websocket base URI`() {
        val url = scribeRealtimeUrl("wss://api.eu.elevenlabs.io", "token value")

        assertEquals("https", url.scheme)
        assertEquals("/v1/speech-to-text/realtime", url.encodedPath)
        assertEquals("scribe_v2_realtime", url.queryParameter("model_id"))
        assertEquals("token value", url.queryParameter("token"))
        assertEquals("vad", url.queryParameter("commit_strategy"))
        assertEquals("pcm_16000", url.queryParameter("audio_format"))
    }

    @Test
    fun `computes normalized pcm audio level`() {
        assertEquals(0f, pcmAudioLevel(byteArrayOf(0, 0)), 0.001f)
        assertEquals(1f, pcmAudioLevel(byteArrayOf(0xff.toByte(), 0x7f)), 0.001f)
    }
}
