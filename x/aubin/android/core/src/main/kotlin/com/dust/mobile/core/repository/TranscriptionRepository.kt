package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.network.ApiClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class TranscriptionRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchRealtimeToken(
        workspaceId: String,
        tokenProvider: TokenProvider,
    ): RealtimeTranscriptionToken =
        apiClient.authenticatedGet(Endpoints.transcribeToken(workspaceId), tokenProvider)

    suspend fun transcribe(
        workspaceId: String,
        fileData: ByteArray,
        fileName: String,
        mimeType: String,
        tokenProvider: TokenProvider,
    ): String {
        val response = apiClient.authenticatedMultipartRaw(
            endpoint = Endpoints.transcribe(workspaceId),
            fileData = fileData,
            fileName = fileName,
            mimeType = mimeType,
            tokenProvider = tokenProvider,
        )
        return parseTranscriptionSse(response.decodeToString())
    }
}

@Serializable
data class RealtimeTranscriptionToken(
    val token: String,
    val baseUri: String,
)

class TranscriptionException(message: String) : Exception(message)

internal fun parseTranscriptionSse(responseText: String): String {
    var transcript: String? = null
    for (line in responseText.lineSequence()) {
        if (!line.startsWith("data: ")) continue
        val payload = line.removePrefix("data: ")
        if (payload == "done") break
        transcript = handleTranscriptionPayload(payload, transcript)
    }

    return transcript?.takeIf { it.isNotEmpty() }
        ?: throw TranscriptionException("No transcript received")
}

private fun handleTranscriptionPayload(payload: String, current: String?): String? {
    val json = runCatching { Json.parseToJsonElement(payload).jsonObject }.getOrNull() ?: return current
    return when (json["type"]?.jsonPrimitive?.contentOrNull) {
        "fullTranscript" -> json["fullTranscript"]?.let(::transcriptText) ?: current
        "error" -> throw TranscriptionException(
            json["error"]?.jsonPrimitive?.contentOrNull ?: "Unknown transcription error",
        )
        else -> current
    }
}

private fun transcriptText(element: kotlinx.serialization.json.JsonElement): String =
    when (element) {
        is JsonPrimitive -> element.content
        is JsonArray -> element.joinToString(separator = "") { message ->
            val obj = message as? JsonObject ?: return@joinToString ""
            when (obj["type"]?.jsonPrimitive?.contentOrNull) {
                "mention" -> "@${obj["name"]?.jsonPrimitive?.contentOrNull.orEmpty()}"
                "text" -> obj["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                else -> ""
            }
        }
        else -> ""
    }
