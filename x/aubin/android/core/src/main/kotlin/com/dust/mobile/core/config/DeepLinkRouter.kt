package com.dust.mobile.core.config

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

sealed interface DeepLinkTarget {
    data class Auth(val callbackUrl: String) : DeepLinkTarget
    data class Frame(val frameUrl: String) : DeepLinkTarget
    data class NewConversation(
        val workspaceId: String? = null,
        val agentId: String? = null,
    ) : DeepLinkTarget
    data object CatchUp : DeepLinkTarget
    data class Conversation(
        val workspaceId: String,
        val conversationId: String,
        val messageId: String? = null,
    ) : DeepLinkTarget
    data class Pod(
        val workspaceId: String,
        val podId: String,
    ) : DeepLinkTarget
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

        if (uri.scheme == callbackScheme && uri.host == "compose") {
            return DeepLinkTarget.NewConversation(
                workspaceId = queryParameter(uri.rawQuery, "workspaceId"),
                agentId = queryParameter(uri.rawQuery, "agentId"),
            )
        }

        if (uri.scheme == callbackScheme && uri.host == "catch-up") {
            return DeepLinkTarget.CatchUp
        }

        if (uri.scheme == callbackScheme && uri.host == "frame") {
            val token = uri.pathSegments().firstOrNull() ?: return null
            return DeepLinkTarget.Frame("$appUrl/share/frame/$token")
        }

        if (uri.scheme == callbackScheme && uri.host == "conversation") {
            val segments = uri.pathSegments()
            if (segments.size >= 2) {
                return DeepLinkTarget.Conversation(
                    workspaceId = segments[0],
                    conversationId = segments[1],
                    messageId = queryParameter(uri.rawQuery, "messageId"),
                )
            }
        }

        if (uri.scheme == callbackScheme && uri.host == "pod") {
            val segments = uri.pathSegments()
            if (segments.size >= 2) {
                return DeepLinkTarget.Pod(
                    workspaceId = segments[0],
                    podId = segments[1],
                )
            }
        }

        if (uri.scheme == "https" &&
            isDustDomain(uri.host) &&
            uri.pathSegments().size >= 3 &&
            uri.pathSegments()[0] == "share" &&
            uri.pathSegments()[1] == "frame"
        ) {
            return DeepLinkTarget.Frame("$appUrl/share/frame/${uri.pathSegments()[2]}")
        }

        if (isSupportedWebUrl(uri, appUrl)) {
            val segments = uri.pathSegments()
            if (segments.size >= 4 && segments[0] == "w" && segments[2] == "assistant") {
                return DeepLinkTarget.Conversation(
                    workspaceId = segments[1],
                    conversationId = segments[3],
                    messageId = queryParameter(uri.rawQuery, "messageId"),
                )
            }
            if (segments.size >= 4 && segments[0] == "w" && segments[2] == "pods") {
                return DeepLinkTarget.Pod(
                    workspaceId = segments[1],
                    podId = segments[3],
                )
            }
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

private fun isSupportedWebUrl(uri: URI, appUrl: String): Boolean {
    if (uri.scheme != "http" && uri.scheme != "https") return false
    if (DeepLinkRouter.isDustDomain(uri.host)) return true

    val configuredAppUri = runCatching { URI(appUrl) }.getOrNull() ?: return false
    return uri.scheme.equals(configuredAppUri.scheme, ignoreCase = true) &&
        uri.host.equals(configuredAppUri.host, ignoreCase = true) &&
        uri.port == configuredAppUri.port
}

private fun URI.pathSegments(): List<String> =
    path.orEmpty().split('/').filter { it.isNotBlank() }

private fun queryParameter(rawQuery: String?, name: String): String? =
    rawQuery
        ?.split('&')
        ?.firstNotNullOfOrNull { part ->
            val key = part.substringBefore('=')
            val value = part.substringAfter('=', missingDelimiterValue = "")
            if (key == name && value.isNotBlank()) {
                URLDecoder.decode(value, StandardCharsets.UTF_8.name())
            } else {
                null
            }
        }
