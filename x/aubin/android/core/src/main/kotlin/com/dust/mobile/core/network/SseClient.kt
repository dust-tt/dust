package com.dust.mobile.core.network

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.config.withQuery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class SseClient(
    private val config: AppConfig,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(1, TimeUnit.HOURS)
        .callTimeout(24, TimeUnit.HOURS)
        .followRedirects(true)
        .build(),
) {
    fun eventStream(
        endpoint: String,
        tokenProvider: TokenProvider,
        lastEventId: String? = null,
    ): Flow<String> = channelFlow {
        var token = tokenProvider.validAccessToken()
        try {
            connectAndForward(endpoint, token, lastEventId)
        } catch (error: ApiError.Http) {
            if (error.statusCode != 401) throw error
            token = tokenProvider.refreshedAccessToken()
            connectAndForward(endpoint, token, lastEventId)
        }
    }

    private suspend fun ProducerScope<String>.connectAndForward(
        endpoint: String,
        accessToken: String,
        lastEventId: String?,
    ) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(buildUrl(endpoint, lastEventId))
            .header("Authorization", "Bearer $accessToken")
            .header("Accept", "text/event-stream")
            .build()
        val call = client.newCall(request)

        call.executeCancellable().use { response ->
            if (!response.isSuccessful) {
                throw ApiError.Http(response.code, response.body?.string().orEmpty())
            }

            val source = response.body?.source() ?: return@use
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                if (!line.startsWith("data:")) continue
                val payload = line.removePrefix("data:").trim(' ')
                if (payload == "done") break
                if (payload.isNotEmpty()) send(payload)
            }
        }
    }

    private fun buildUrl(endpoint: String, lastEventId: String?): String {
        val endpointWithQuery = if (lastEventId.isNullOrBlank()) {
            endpoint
        } else {
            withQuery(endpoint, mapOf("lastEventId" to lastEventId))
        }
        return if (endpointWithQuery.startsWith("http://") || endpointWithQuery.startsWith("https://")) {
            endpointWithQuery
        } else {
            "${config.apiBaseUrl}$endpointWithQuery"
        }
    }
}

private suspend fun Call.executeCancellable(): Response =
    suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { cancel() }
        try {
            val response = execute()
            if (continuation.isActive) {
                continuation.resume(response)
            } else {
                response.close()
            }
        } catch (error: IOException) {
            if (continuation.isActive) {
                continuation.resumeWithException(error)
            }
        }
    }
