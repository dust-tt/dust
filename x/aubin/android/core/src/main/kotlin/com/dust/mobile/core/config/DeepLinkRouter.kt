package com.dust.mobile.core.config

import java.net.URI

sealed interface DeepLinkTarget {
    data class Auth(val callbackUrl: String) : DeepLinkTarget
    data class Frame(val frameUrl: String) : DeepLinkTarget
    data object LocalPreview : DeepLinkTarget
}

object DeepLinkRouter {
    fun resolve(
        rawUrl: String,
        appUrl: String,
        callbackScheme: String = "dust",
        callbackHost: String = "auth",
        allowLocalPreview: Boolean = false,
    ): DeepLinkTarget? {
        val uri = runCatching { URI(rawUrl) }.getOrNull() ?: return null
        if (uri.scheme == callbackScheme && uri.host == callbackHost && queryParameter(uri.rawQuery, "code") != null) {
            return DeepLinkTarget.Auth(rawUrl)
        }

        if (allowLocalPreview && uri.scheme == callbackScheme && uri.host == "local-preview") {
            return DeepLinkTarget.LocalPreview
        }

        if (uri.scheme == callbackScheme && uri.host == "frame") {
            val token = uri.pathSegments().firstOrNull() ?: return null
            return DeepLinkTarget.Frame("$appUrl/share/frame/$token")
        }

        if (uri.scheme == "https" &&
            isDustDomain(uri.host) &&
            uri.pathSegments().size >= 3 &&
            uri.pathSegments()[0] == "share" &&
            uri.pathSegments()[1] == "frame"
        ) {
            return DeepLinkTarget.Frame("$appUrl/share/frame/${uri.pathSegments()[2]}")
        }

        return null
    }

    fun isDustDomain(host: String?): Boolean {
        val normalizedHost = host?.lowercase() ?: return false
        return normalizedHost == "dust.tt" || normalizedHost.endsWith(".dust.tt")
    }

    fun shouldOpenInEmbeddedWebView(rawUrl: String, allowedHost: String? = null): Boolean {
        val host = runCatching { URI(rawUrl).host }.getOrNull() ?: return true
        return isDustDomain(host) || host.equals(allowedHost, ignoreCase = true)
    }
}

private fun URI.pathSegments(): List<String> =
    path.orEmpty().split('/').filter { it.isNotBlank() }

private fun queryParameter(rawQuery: String?, name: String): String? =
    rawQuery
        ?.split('&')
        ?.firstNotNullOfOrNull { part ->
            val key = part.substringBefore('=')
            val value = part.substringAfter('=', missingDelimiterValue = "")
            if (key == name && value.isNotBlank()) value else null
        }
