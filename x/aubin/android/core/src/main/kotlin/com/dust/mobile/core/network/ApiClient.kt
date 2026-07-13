package com.dust.mobile.core.network

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.AppConfig
import kotlinx.serialization.KSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.serializer
import kotlinx.coroutines.CancellationException
import java.util.UUID

class ApiClient(
    private val config: AppConfig,
    private val engine: HttpEngine,
) {
    suspend inline fun <reified T> get(
        endpoint: String,
        accessToken: String? = null,
    ): T = get(endpoint, serializer(), accessToken)

    suspend fun <T> get(
        endpoint: String,
        serializer: KSerializer<T>,
        accessToken: String? = null,
    ): T {
        val request = buildRequest(HttpMethod.GET, endpoint, accessToken)
        return executeJson(request, serializer)
    }

    suspend inline fun <reified Body, reified T> post(
        endpoint: String,
        body: Body,
        accessToken: String? = null,
    ): T = post(endpoint, body, serializer(), serializer(), accessToken)

    suspend fun <Body, T> post(
        endpoint: String,
        body: Body,
        bodySerializer: KSerializer<Body>,
        responseSerializer: KSerializer<T>,
        accessToken: String? = null,
    ): T {
        val request = buildRequest(
            method = HttpMethod.POST,
            endpoint = endpoint,
            accessToken = accessToken,
            headers = mapOf("Content-Type" to "application/json"),
            body = DustJson.encodeToString(bodySerializer, body).encodeToByteArray(),
        )
        return executeJson(request, responseSerializer)
    }

    suspend inline fun <reified Body> send(
        endpoint: String,
        method: HttpMethod,
        body: Body,
        accessToken: String? = null,
    ) = send(endpoint, method, body, serializer(), accessToken)

    suspend fun <Body> send(
        endpoint: String,
        method: HttpMethod,
        body: Body,
        bodySerializer: KSerializer<Body>,
        accessToken: String? = null,
    ) {
        val request = buildRequest(
            method = method,
            endpoint = endpoint,
            accessToken = accessToken,
            headers = mapOf("Content-Type" to "application/json"),
            body = DustJson.encodeToString(bodySerializer, body).encodeToByteArray(),
        )
        perform(request)
    }

    suspend inline fun <reified T> authenticatedGet(
        endpoint: String,
        tokenProvider: TokenProvider,
    ): T = withAuthRetry(tokenProvider) { token -> get<T>(endpoint, token) }

    suspend inline fun <reified Body, reified T> authenticatedPost(
        endpoint: String,
        body: Body,
        tokenProvider: TokenProvider,
    ): T = withAuthRetry(tokenProvider) { token -> post<Body, T>(endpoint, body, token) }

    suspend inline fun <reified Body> authenticatedSend(
        endpoint: String,
        method: HttpMethod,
        body: Body,
        tokenProvider: TokenProvider,
    ) = withAuthRetry(tokenProvider) { token ->
        send(endpoint, method, body, token)
        Unit
    }

    suspend inline fun <T> withAuthRetry(
        tokenProvider: TokenProvider,
        crossinline operation: suspend (String) -> T,
    ): T {
        val token = tokenProvider.validAccessToken()
        return try {
            operation(token)
        } catch (error: ApiError.Http) {
            if (error.statusCode != 401) {
                throw error
            }
            operation(tokenProvider.refreshedAccessToken())
        }
    }

    suspend fun authenticatedRawGet(
        endpoint: String,
        tokenProvider: TokenProvider,
    ): ByteArray = withAuthRetry(tokenProvider) { token ->
        perform(buildRequest(HttpMethod.GET, endpoint, token)).body
    }

    suspend fun authenticatedRawGetResponse(
        endpoint: String,
        tokenProvider: TokenProvider,
    ): HttpResponse = withAuthRetry(tokenProvider) { token ->
        perform(buildRequest(HttpMethod.GET, endpoint, token))
    }

    suspend inline fun <reified T> authenticatedMultipartUpload(
        urlString: String,
        fileData: ByteArray,
        fileName: String,
        mimeType: String,
        tokenProvider: TokenProvider,
    ): T = authenticatedMultipartUpload(urlString, fileData, fileName, mimeType, tokenProvider, serializer())

    suspend fun <T> authenticatedMultipartUpload(
        urlString: String,
        fileData: ByteArray,
        fileName: String,
        mimeType: String,
        tokenProvider: TokenProvider,
        responseSerializer: KSerializer<T>,
    ): T {
        val boundary = "Boundary-${UUID.randomUUID()}"
        val body = buildMultipartBody(fileData, fileName, mimeType, boundary)
        return withAuthRetry(tokenProvider) { token ->
            val request = buildRequest(
                method = HttpMethod.POST,
                endpoint = urlString,
                accessToken = token,
                headers = mapOf("Content-Type" to "multipart/form-data; boundary=$boundary"),
                body = body,
            )
            executeJson(request, responseSerializer)
        }
    }

    suspend fun authenticatedMultipartRaw(
        endpoint: String,
        fileData: ByteArray,
        fileName: String,
        mimeType: String,
        tokenProvider: TokenProvider,
    ): ByteArray {
        val boundary = "Boundary-${UUID.randomUUID()}"
        val body = buildMultipartBody(fileData, fileName, mimeType, boundary)
        return withAuthRetry(tokenProvider) { token ->
            val request = buildRequest(
                method = HttpMethod.POST,
                endpoint = endpoint,
                accessToken = token,
                headers = mapOf("Content-Type" to "multipart/form-data; boundary=$boundary"),
                body = body,
            )
            perform(request).body
        }
    }

    fun buildMultipartBody(
        fileData: ByteArray,
        fileName: String,
        mimeType: String,
        boundary: String,
    ): ByteArray {
        val prefix = "--$boundary\r\n" +
            "Content-Disposition: form-data; name=\"file\"; filename=\"$fileName\"\r\n" +
            "Content-Type: $mimeType\r\n\r\n"
        val suffix = "\r\n--$boundary--\r\n"
        return prefix.encodeToByteArray() + fileData + suffix.encodeToByteArray()
    }

    suspend fun perform(request: HttpRequest): HttpResponse {
        val response = try {
            engine.execute(request)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw ApiError.Network(error)
        }
        if (response.statusCode !in 200..299) {
            throw ApiError.Http(response.statusCode, response.body.decodeToString())
        }
        return response
    }

    fun buildRequest(
        method: HttpMethod,
        endpoint: String,
        accessToken: String? = null,
        headers: Map<String, String> = emptyMap(),
        body: ByteArray? = null,
    ): HttpRequest {
        val url = if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
            endpoint
        } else {
            "${config.apiBaseUrl}$endpoint"
        }
        val authHeaders = if (accessToken == null) {
            emptyMap()
        } else {
            mapOf("Authorization" to "Bearer $accessToken")
        }
        return HttpRequest(method = method, url = url, headers = authHeaders + headers, body = body)
    }

    private suspend fun <T> executeJson(request: HttpRequest, serializer: KSerializer<T>): T {
        val response = perform(request)
        val text = response.body.decodeToString()
        return try {
            DustJson.decodeFromString(serializer, text)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            throw ApiError.Decoding(text, error)
        }
    }
}
