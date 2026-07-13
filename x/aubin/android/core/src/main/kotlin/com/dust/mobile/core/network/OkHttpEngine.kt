package com.dust.mobile.core.network

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class OkHttpEngine(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) : HttpEngine {
    override suspend fun execute(request: HttpRequest): HttpResponse =
        kotlinx.coroutines.Dispatchers.IO.let {
            kotlinx.coroutines.withContext(it) {
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

                client.newCall(builder.build()).execute().use { response ->
                    HttpResponse(
                        statusCode = response.code,
                        headers = response.headers.toMap(),
                        body = response.body?.bytes() ?: ByteArray(0),
                    )
                }
            }
        }
}
