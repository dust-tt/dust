package com.dust.mobile.core.network

import java.io.IOException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class OkHttpEngine(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .callTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
) : HttpEngine {
    override suspend fun execute(request: HttpRequest): HttpResponse {
        val builder = Request.Builder().url(request.url)
        request.headers.forEach { (key, value) -> builder.header(key, value) }

        val requestBody = request.body?.toRequestBody(
            request.headers["Content-Type"]?.toMediaTypeOrNull(),
        )
        when (request.method) {
            HttpMethod.GET -> builder.get()
            HttpMethod.POST -> builder.post(requestBody ?: ByteArray(0).toRequestBody(null))
            HttpMethod.PATCH -> builder.patch(requestBody ?: ByteArray(0).toRequestBody(null))
            HttpMethod.DELETE -> if (requestBody == null) builder.delete() else builder.delete(requestBody)
        }

        val call = client.newCall(builder.build())
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, error: IOException) {
                    if (continuation.isActive) {
                        continuation.resumeWithException(error)
                    }
                }

                override fun onResponse(call: Call, response: Response) {
                    if (!continuation.isActive) {
                        response.close()
                        return
                    }
                    try {
                        val result = response.use {
                            HttpResponse(
                                statusCode = it.code,
                                headers = it.headers.toMap(),
                                body = it.body?.bytes() ?: ByteArray(0),
                            )
                        }
                        if (continuation.isActive) {
                            continuation.resume(result)
                        }
                    } catch (error: IOException) {
                        if (continuation.isActive) {
                            continuation.resumeWithException(error)
                        }
                    }
                }
            })
        }
    }
}
