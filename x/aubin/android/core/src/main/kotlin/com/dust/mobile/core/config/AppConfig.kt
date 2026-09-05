package com.dust.mobile.core.config

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class AppConfig(
    val apiBaseUrl: String,
    val appUrl: String,
    val callbackScheme: String = "dust",
    val callbackHost: String = "auth",
    val vizUrl: String = "https://viz.dust.tt",
) {
    val callbackUrl: String = "$callbackScheme://$callbackHost"

    fun conversationUrl(workspaceId: String, conversationId: String): String =
        "${appUrl.trimEnd('/')}/w/$workspaceId/assistant/$conversationId"

    fun podUrl(workspaceId: String, podId: String): String =
        "${appUrl.trimEnd('/')}/w/$workspaceId/pods/$podId"

    companion object {
        fun debug(): AppConfig = AppConfig(
            apiBaseUrl = "http://10.0.2.2:3000",
            appUrl = "http://10.0.2.2:3000",
        )

        fun production(): AppConfig = AppConfig(
            apiBaseUrl = "https://dust.tt",
            appUrl = "https://app.dust.tt",
        )
    }
}

object Endpoints {
    const val LOGIN = "/api/workos/login"
    const val AUTHENTICATE = "/api/workos/authenticate"
    const val REVOKE_SESSION = "/api/workos/revoke-session"
    const val USER = "/api/user"
    const val MOBILE_NOTIFICATION_TOKENS = "/api/user/mobile_notification_tokens"

    fun conversations(workspaceId: String): String =
        "/api/w/$workspaceId/assistant/conversations"

    fun searchConversations(workspaceId: String): String =
        "/api/w/$workspaceId/assistant/conversations/search"

    fun conversation(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId"

    fun conversationMessages(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/messages"

    fun conversationMessage(workspaceId: String, conversationId: String, messageId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/messages/$messageId"

    fun conversationEvents(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/events"

    fun messageEvents(workspaceId: String, conversationId: String, messageId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/messages/$messageId/events"

    fun conversationsBulkActions(workspaceId: String): String =
        "/api/w/$workspaceId/assistant/conversations/bulk-actions"

    fun agentConfigurations(workspaceId: String): String =
        "/api/v1/w/$workspaceId/assistant/agent_configurations"

    fun transcribe(workspaceId: String): String =
        "/api/w/$workspaceId/services/transcribe"

    fun transcribeToken(workspaceId: String): String =
        "/api/w/$workspaceId/services/transcribe/get-token"

    fun files(workspaceId: String): String =
        "/api/w/$workspaceId/files"

    fun conversationContentFragments(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/content_fragment"

    fun fileView(workspaceId: String, fileId: String): String =
        "/api/w/$workspaceId/files/$fileId?action=view"

    fun conversationAttachments(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/attachments"

    fun blockedActions(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/actions/blocked"

    fun validateAction(workspaceId: String, conversationId: String, messageId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/messages/$messageId/validate-action"

    fun retryMessage(workspaceId: String, conversationId: String, messageId: String): String =
        "/api/v1/w/$workspaceId/assistant/conversations/$conversationId/messages/$messageId/retry"

    fun answerQuestion(workspaceId: String, conversationId: String, messageId: String): String =
        "/api/v1/w/$workspaceId/assistant/conversations/$conversationId/messages/$messageId/answer-question"

    fun mcpServerViews(workspaceId: String): String =
        "/api/w/$workspaceId/mcp/views"

    fun skills(workspaceId: String): String =
        "/api/w/$workspaceId/skills"

    fun conversationTools(workspaceId: String, conversationId: String): String =
        "/api/w/$workspaceId/assistant/conversations/$conversationId/tools"

    fun search(workspaceId: String): String =
        "/api/w/$workspaceId/search"

    fun spaces(workspaceId: String): String =
        "/api/w/$workspaceId/spaces"

    fun spacesSummary(workspaceId: String): String =
        "/api/w/$workspaceId/assistant/conversations/spaces"

    fun spaceConversations(workspaceId: String, spaceId: String): String =
        "/api/w/$workspaceId/assistant/conversations/spaces/$spaceId"

    fun space(workspaceId: String, spaceId: String): String =
        "/api/w/$workspaceId/spaces/$spaceId"

    fun podFiles(workspaceId: String, podId: String): String =
        "/api/w/$workspaceId/spaces/$podId/files"

    fun podTasks(workspaceId: String, podId: String): String =
        "/api/w/$workspaceId/spaces/$podId/project_tasks"

    fun podTask(workspaceId: String, podId: String, taskId: String): String =
        "/api/w/$workspaceId/spaces/$podId/project_tasks/$taskId"

    fun podMetadata(workspaceId: String, podId: String): String =
        "/api/w/$workspaceId/spaces/$podId/project_metadata"

    fun podNotificationPreferences(workspaceId: String, podId: String): String =
        "/api/w/$workspaceId/spaces/$podId/project_notification_preferences"
}

fun withQuery(endpoint: String, params: Map<String, String?>): String {
    val query = params
        .filterValues { it != null }
        .map { (key, value) -> "${key.encode()}=${value.orEmpty().encode()}" }
        .joinToString("&")
    if (query.isEmpty()) {
        return endpoint
    }
    val separator = if (endpoint.contains("?")) "&" else "?"
    return "$endpoint$separator$query"
}

private fun String.encode(): String =
    URLEncoder.encode(this, StandardCharsets.UTF_8.toString()).replace("+", "%20")
