package com.dust.mobile.core.network

enum class HttpMethod {
    GET,
    POST,
    PATCH,
    DELETE,
}

data class HttpRequest(
    val method: HttpMethod,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: ByteArray? = null,
) {
    override fun equals(other: Any?): Boolean =
        other is HttpRequest &&
            method == other.method &&
            url == other.url &&
            headers == other.headers &&
            body.contentEquals(other.body)

    override fun hashCode(): Int {
        var result = method.hashCode()
        result = 31 * result + url.hashCode()
        result = 31 * result + headers.hashCode()
        result = 31 * result + (body?.contentHashCode() ?: 0)
        return result
    }
}

data class HttpResponse(
    val statusCode: Int,
    val headers: Map<String, String> = emptyMap(),
    val body: ByteArray = ByteArray(0),
)

interface HttpEngine {
    suspend fun execute(request: HttpRequest): HttpResponse
}

sealed class ApiError(message: String, cause: Throwable? = null) : Exception(message, cause) {
    data object InvalidUrl : ApiError("Invalid URL")
    data class Http(val statusCode: Int, val responseBody: String) :
        ApiError("HTTP $statusCode: $responseBody")

    data class Decoding(val responseBody: String, override val cause: Throwable) :
        ApiError("Failed to decode response", cause)

    data class Network(override val cause: Throwable) :
        ApiError(cause.message ?: "Network error", cause)
}
