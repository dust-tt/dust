package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.config.withQuery
import com.dust.mobile.core.model.MCPServerViewsResponse
import com.dust.mobile.core.model.SearchRequest
import com.dust.mobile.core.model.SearchResponse
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.SkillsResponse
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class CapabilityRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchMcpServerViews(
        workspaceId: String,
        spaceIds: List<String>,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedGet<MCPServerViewsResponse>(
        withQuery(
            Endpoints.mcpServerViews(workspaceId),
            mapOf(
                "spaceIds" to spaceIds.joinToString(","),
                "availabilities" to "manual,auto",
            ),
        ),
        tokenProvider,
    ).serverViews

    suspend fun fetchSkills(workspaceId: String, tokenProvider: TokenProvider): List<Skill> =
        apiClient.authenticatedGet<SkillsResponse>(
            withQuery(
                Endpoints.skills(workspaceId),
                mapOf("status" to "active", "globalSpaceOnly" to "true"),
            ),
            tokenProvider,
        ).skills

    suspend fun searchKnowledge(
        workspaceId: String,
        query: String,
        tokenProvider: TokenProvider,
        cursor: String? = null,
    ): SearchResponse = apiClient.authenticatedPost<SearchRequest, SearchResponse>(
        withQuery(Endpoints.search(workspaceId), mapOf("cursor" to cursor)),
        SearchRequest(query = query),
        tokenProvider,
    )

    suspend fun updateTool(
        action: ConversationAction,
        workspaceId: String,
        conversationId: String,
        mcpServerViewId: String,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
        Endpoints.conversationTools(workspaceId, conversationId),
        HttpMethod.POST,
        ConversationToolActionRequest(action = action, mcpServerViewId = mcpServerViewId),
        tokenProvider,
    )
}

@Serializable
enum class ConversationAction {
    @SerialName("add")
    ADD,

    @SerialName("delete")
    DELETE,
}

@Serializable
private data class ConversationToolActionRequest(
    val action: ConversationAction,
    @SerialName("mcp_server_view_id")
    val mcpServerViewId: String,
)
