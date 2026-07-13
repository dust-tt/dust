package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.config.withQuery
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.AgentConfigurationsResponse
import com.dust.mobile.core.model.BlockedAction
import com.dust.mobile.core.model.BlockedActionsResponse
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationAttachmentsResponse
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ConversationMessagesResponse
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.DustUserResponse
import com.dust.mobile.core.model.FileUploadRequest
import com.dust.mobile.core.model.FileUploadResponse
import com.dust.mobile.core.model.FileUploadedResponse
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MCPServerViewsResponse
import com.dust.mobile.core.model.PostContentFragmentRequest
import com.dust.mobile.core.model.PostContentFragmentResponse
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.PostMessageResponse
import com.dust.mobile.core.model.SearchRequest
import com.dust.mobile.core.model.SearchResponse
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.SkillsResponse
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.SpaceSummaryResponse
import com.dust.mobile.core.model.SpacesResponse
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class UserRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchDustUser(tokenProvider: TokenProvider): DustUser =
        apiClient.authenticatedGet<DustUserResponse>(Endpoints.USER, tokenProvider).user
}

class ConversationRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchConversations(
        workspaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = DEFAULT_LIMIT,
    ): ConversationsResponse =
        apiClient.authenticatedGet(
            withQuery(Endpoints.conversations(workspaceId), mapOf("limit" to limit.toString())),
            tokenProvider,
        )

    suspend fun fetchSpaceConversations(
        workspaceId: String,
        spaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = DEFAULT_LIMIT,
    ): ConversationsResponse =
        apiClient.authenticatedGet(
            withQuery(Endpoints.spaceConversations(workspaceId, spaceId), mapOf("limit" to limit.toString())),
            tokenProvider,
        )

    suspend fun fetchMessages(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
        limit: Int = 50,
        lastValue: Int? = null,
    ): ConversationMessagesResponse =
        apiClient.authenticatedGet(
            withQuery(
                Endpoints.conversationMessages(workspaceId, conversationId),
                mapOf(
                    "newResponseFormat" to "1",
                    "orderDirection" to "desc",
                    "orderColumn" to "rank",
                    "limit" to limit.toString(),
                    "lastValue" to lastValue?.toString(),
                ),
            ),
            tokenProvider,
        )

    suspend fun fetchMessage(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        tokenProvider: TokenProvider,
    ): ConversationMessage =
        apiClient.authenticatedGet<ConversationMessageResponse>(
            Endpoints.conversationMessage(workspaceId, conversationId, messageId),
            tokenProvider,
        ).message

    suspend fun createConversation(
        workspaceId: String,
        request: CreateConversationRequest,
        tokenProvider: TokenProvider,
    ): Conversation =
        apiClient.authenticatedPost<CreateConversationRequest, CreateConversationResponse>(
            Endpoints.conversations(workspaceId),
            request,
            tokenProvider,
        ).conversation

    suspend fun postMessage(
        workspaceId: String,
        conversationId: String,
        request: PostMessageRequest,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedPost<PostMessageRequest, PostMessageResponse>(
            Endpoints.conversationMessages(workspaceId, conversationId),
            request,
            tokenProvider,
        )
    }

    suspend fun markAsRead(workspaceId: String, conversationId: String, tokenProvider: TokenProvider) =
        setReadStatus(workspaceId, conversationId, read = true, tokenProvider)

    suspend fun markAsUnread(workspaceId: String, conversationId: String, tokenProvider: TokenProvider) =
        setReadStatus(workspaceId, conversationId, read = false, tokenProvider)

    suspend fun bulkMarkAsRead(workspaceId: String, conversationIds: List<String>, tokenProvider: TokenProvider) =
        apiClient.authenticatedSend(
            Endpoints.conversationsBulkActions(workspaceId),
            HttpMethod.POST,
            BulkMarkAsReadRequest(action = "mark_as_read", conversationIds = conversationIds),
            tokenProvider,
        )

    suspend fun deleteConversation(workspaceId: String, conversationId: String, tokenProvider: TokenProvider) =
        apiClient.authenticatedSend(
            withQuery(Endpoints.conversation(workspaceId, conversationId), mapOf("forceDelete" to "true")),
            HttpMethod.DELETE,
            EmptyRequest,
            tokenProvider,
        )

    suspend fun fetchBlockedActions(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
    ): List<BlockedAction> =
        apiClient.authenticatedGet<BlockedActionsResponse>(
            Endpoints.blockedActions(workspaceId, conversationId),
            tokenProvider,
        ).blockedActions

    suspend fun validateAction(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        actionId: String,
        approved: ActionApproval,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
        Endpoints.validateAction(workspaceId, conversationId, messageId),
        HttpMethod.POST,
        ValidateActionRequest(actionId = actionId, approved = approved.rawValue),
        tokenProvider,
    )

    suspend fun answerQuestion(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        actionId: String,
        answer: UserQuestionAnswer,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
        Endpoints.answerQuestion(workspaceId, conversationId, messageId),
        HttpMethod.POST,
        AnswerQuestionRequest(actionId = actionId, answer = answer),
        tokenProvider,
    )

    suspend fun retryMessage(
        workspaceId: String,
        conversationId: String,
        messageId: String,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
        Endpoints.retryMessage(workspaceId, conversationId, messageId),
        HttpMethod.POST,
        EmptyRequest,
        tokenProvider,
    )

    private suspend fun setReadStatus(
        workspaceId: String,
        conversationId: String,
        read: Boolean,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
        Endpoints.conversation(workspaceId, conversationId),
        HttpMethod.PATCH,
        MarkAsReadRequest(read = read),
        tokenProvider,
    )

    private companion object {
        const val DEFAULT_LIMIT = 100
    }
}

class AgentRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchAgents(workspaceId: String, tokenProvider: TokenProvider): List<LightAgentConfiguration> =
        apiClient.authenticatedGet<AgentConfigurationsResponse>(
            "${Endpoints.agentConfigurations(workspaceId)}?view=list",
            tokenProvider,
        ).agentConfigurations
}

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

    suspend fun searchKnowledge(workspaceId: String, query: String, tokenProvider: TokenProvider): SearchResponse =
        apiClient.authenticatedPost<SearchRequest, SearchResponse>(
            Endpoints.search(workspaceId),
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
        ConversationToolActionRequest(action = action.rawValue, mcpServerViewId = mcpServerViewId),
        tokenProvider,
    )
}

class SpaceRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchPods(workspaceId: String, tokenProvider: TokenProvider): List<Space> =
        apiClient.authenticatedGet<SpaceSummaryResponse>(
            Endpoints.spacesSummary(workspaceId),
            tokenProvider,
        ).summary.map { it.space }.filter { it.kind == "project" }

    suspend fun fetchGlobalSpaces(workspaceId: String, tokenProvider: TokenProvider): List<Space> =
        apiClient.authenticatedGet<SpacesResponse>(
            Endpoints.spaces(workspaceId),
            tokenProvider,
        ).spaces.filter { it.kind == "global" }
}

class FileRepository(
    private val apiClient: ApiClient,
) {
    suspend fun uploadFile(
        workspaceId: String,
        fileName: String,
        contentType: String,
        fileData: ByteArray,
        tokenProvider: TokenProvider,
    ): String {
        val record = apiClient.authenticatedPost<FileUploadRequest, FileUploadResponse>(
            Endpoints.files(workspaceId),
            FileUploadRequest(contentType = contentType, fileName = fileName, fileSize = fileData.size),
            tokenProvider,
        ).file

        apiClient.authenticatedMultipartUpload<FileUploadedResponse>(
            urlString = record.uploadUrl,
            fileData = fileData,
            fileName = fileName,
            mimeType = contentType,
            tokenProvider = tokenProvider,
        )

        return record.sId
    }

    suspend fun postContentFragment(
        workspaceId: String,
        conversationId: String,
        fileId: String,
        fileName: String,
        profilePictureUrl: String?,
        tokenProvider: TokenProvider,
    ) {
        postContentFragment(
            workspaceId = workspaceId,
            conversationId = conversationId,
            payload = ContentFragmentPayload.file(
                title = fileName,
                fileId = fileId,
                context = ContentFragmentContext(profilePictureUrl = profilePictureUrl),
            ),
            tokenProvider = tokenProvider,
        )
    }

    suspend fun postContentFragment(
        workspaceId: String,
        conversationId: String,
        payload: ContentFragmentPayload,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedPost<PostContentFragmentRequest, PostContentFragmentResponse>(
            Endpoints.conversationContentFragments(workspaceId, conversationId),
            PostContentFragmentRequest.from(payload),
            tokenProvider,
        )
    }

    suspend fun fetchAttachments(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedGet<ConversationAttachmentsResponse>(
        Endpoints.conversationAttachments(workspaceId, conversationId),
        tokenProvider,
    ).attachments

    suspend fun fetchFileData(workspaceId: String, fileId: String, tokenProvider: TokenProvider): ByteArray =
        apiClient.authenticatedRawGet(Endpoints.fileView(workspaceId, fileId), tokenProvider)

    suspend fun fetchFileContent(
        workspaceId: String,
        fileId: String,
        tokenProvider: TokenProvider,
    ): FrameFileContent {
        val response = apiClient.authenticatedRawGetResponse(Endpoints.fileView(workspaceId, fileId), tokenProvider)
        return FrameFileContent(
            data = response.body,
            contentType = response.headers["Content-Type"] ?: response.headers["content-type"],
        )
    }
}

data class FrameFileContent(
    val data: ByteArray,
    val contentType: String?,
)

enum class ConversationAction(val rawValue: String) {
    ADD("add"),
    DELETE("delete"),
}

@Serializable
private data class ConversationMessageResponse(val message: ConversationMessage)

@Serializable
private data class CreateConversationResponse(val conversation: Conversation)

@Serializable
private object EmptyRequest

@Serializable
private data class MarkAsReadRequest(val read: Boolean)

@Serializable
private data class BulkMarkAsReadRequest(val action: String, val conversationIds: List<String>)

@Serializable
private data class ValidateActionRequest(val actionId: String, val approved: String)

@Serializable
private data class AnswerQuestionRequest(val actionId: String, val answer: UserQuestionAnswer)

@Serializable
private data class ConversationToolActionRequest(
    val action: String,
    @SerialName("mcp_server_view_id")
    val mcpServerViewId: String,
)
