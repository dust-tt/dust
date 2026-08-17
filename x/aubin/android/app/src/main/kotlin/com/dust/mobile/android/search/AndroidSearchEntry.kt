package com.dust.mobile.android.search

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.Space
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

internal data class AndroidSearchEntry(
    val namespace: String,
    val id: String,
    val title: String,
    val description: String?,
    val alternateNames: List<String>,
    val deepLink: String,
    val score: Int,
    val creationTimestampMillis: Long,
)

internal fun conversationSearchEntries(
    workspaceId: String,
    conversations: List<Conversation>,
    limit: Int = 50,
): List<AndroidSearchEntry> =
    conversations
        .asSequence()
        .filter { !it.title.isNullOrBlank() }
        .sortedByDescending(Conversation::effectiveEpochMs)
        .take(limit)
        .mapIndexed { rank, conversation ->
            AndroidSearchEntry(
                namespace = contentNamespace(workspaceId),
                id = "conversation:${conversation.sId}",
                title = conversation.title.orEmpty(),
                description = when {
                    conversation.actionRequired -> "Action required in Dust"
                    conversation.unread -> "Unread conversation in Dust"
                    else -> "Recent Dust conversation"
                },
                alternateNames = listOf("Dust conversation"),
                deepLink = "dust://conversation/$workspaceId/${conversation.sId}",
                score = 700 - rank.coerceAtMost(100),
                creationTimestampMillis = conversation.effectiveEpochMs.toLong().coerceAtLeast(0),
            )
        }
        .toList()

internal fun podSearchEntries(workspaceId: String, pods: List<Space>): List<AndroidSearchEntry> =
    pods.mapIndexed { rank, pod ->
        AndroidSearchEntry(
            namespace = contentNamespace(workspaceId),
            id = "pod:${pod.sId}",
            title = pod.name,
            description = pod.description?.takeIf(String::isNotBlank) ?: "Dust pod",
            alternateNames = listOf("Dust pod", "project space"),
            deepLink = "dust://pod/$workspaceId/${pod.sId}",
            score = 500 - rank.coerceAtMost(100),
            creationTimestampMillis = 0,
        )
    }

internal fun agentSearchEntries(
    workspaceId: String,
    agents: List<LightAgentConfiguration>,
): List<AndroidSearchEntry> = agents.mapIndexed { rank, agent ->
    AndroidSearchEntry(
        namespace = agentNamespace(workspaceId),
        id = "agent:${agent.sId}",
        title = agent.name,
        description = agent.description?.takeIf(String::isNotBlank) ?: "Dust agent",
        alternateNames = listOf("Dust agent", "Ask ${agent.name}"),
        deepLink = "dust://compose?workspaceId=${workspaceId.urlEncoded()}&agentId=${agent.sId.urlEncoded()}",
        score = (if (agent.userFavorite) 900 else 600) - rank.coerceAtMost(100),
        creationTimestampMillis = 0,
    )
}

internal fun contentNamespace(workspaceId: String): String = "$workspaceId:content"

internal fun agentNamespace(workspaceId: String): String = "$workspaceId:agents"

private fun String.urlEncoded(): String = URLEncoder.encode(this, StandardCharsets.UTF_8.name())
