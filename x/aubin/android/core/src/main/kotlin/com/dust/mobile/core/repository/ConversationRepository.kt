package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.config.withQuery
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.BlockedAction
import com.dust.mobile.core.model.BlockedActionsResponse
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ConversationMessagesResponse
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.filteredByTitleSearch
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.model.PostMessageResponse
import com.dust.mobile.core.model.PodConversationsResponse
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class ConversationRepository(
    private val apiClient: ApiClient,
) {
    suspend fun searchConversations(
        workspaceId: String,
        query: String,
        tokenProvider: TokenProvider,
        lastValue: String? = null,
    ): ConversationsResponse {
        val page = fetchConversations(workspaceId, tokenProvider, lastValue = lastValue)
        return page.copy(conversations = page.conversations.filteredByTitleSearch(query))
    }

    suspend fun fetchConversations(
        workspaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = DEFAULT_LIMIT,
        lastValue: String? = null,
    ): ConversationsResponse =
        apiClient.authenticatedGet(
            withQuery(
                Endpoints.conversations(workspaceId),
                mapOf("limit" to limit.toString(), "lastValue" to lastValue),
            ),
            tokenProvider,
        )

    suspend fun fetchSpaceConversations(
        workspaceId: String,
        spaceId: String,
        tokenProvider: TokenProvider,
        limit: Int = DEFAULT_LIMIT,
        lastValue: String? = null,
    ): PodConversationsResponse =
        apiClient.authenticatedGet(
            withQuery(
                Endpoints.spaceConversations(workspaceId, spaceId),
                mapOf("limit" to limit.toString(), "lastValue" to lastValue),
            ),
            tokenProvider,
        )

    suspend fun fetchConversation(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
    ): Conversation =
        apiClient.authenticatedGet<ConversationResponse>(
            Endpoints.conversation(workspaceId, conversationId),
            tokenProvider,
        ).conversation

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
            withQuery(
                Endpoints.conversationMessage(workspaceId, conversationId, messageId),
                mapOf("viewType" to "light"),
            ),
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
    ): PostMessageResponse =
        apiClient.authenticatedPost<PostMessageRequest, PostMessageResponse>(
            Endpoints.conversationMessages(workspaceId, conversationId),
            request,
            tokenProvider,
        )

    suspend fun markAsRead(workspaceId: String, conversationId: String, tokenProvider: TokenProvider) =
        setReadStatus(workspaceId, conversationId, read = true, tokenProvider)

    suspend fun markAsUnread(workspaceId: String, conversationId: String, tokenProvider: TokenProvider) =
        setReadStatus(workspaceId, conversationId, read = false, tokenProvider)

    suspend fun bulkMarkAsRead(
        workspaceId: String,
        conversationIds: List<String>,
        tokenProvider: TokenProvider,
    ) {
        require(conversationIds.isNotEmpty()) { "At least one conversation ID is required" }
        apiClient.authenticatedSend(
            Endpoints.conversationsBulkActions(workspaceId),
            HttpMethod.POST,
            BulkMarkAsReadRequest(
                action = BulkConversationAction.MARK_AS_READ,
                conversationIds = conversationIds,
            ),
            tokenProvider,
        )
    }

    suspend fun deleteConversation(
        workspaceId: String,
        conversationId: String,
        tokenProvider: TokenProvider,
    ) = apiClient.authenticatedSend(
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
        ValidateActionRequest(actionId = actionId, approved = approved),
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

@Serializable
private data class ConversationMessageResponse(val message: ConversationMessage)

@Serializable
private data class ConversationResponse(val conversation: Conversation)

@Serializable
private data class CreateConversationResponse(val conversation: Conversation)

@Serializable
private object EmptyRequest

@Serializable
private data class MarkAsReadRequest(val read: Boolean)

@Serializable
private enum class BulkConversationAction {
    @SerialName("mark_as_read")
    MARK_AS_READ,
}

@Serializable
private data class BulkMarkAsReadRequest(
    val action: BulkConversationAction,
    val conversationIds: List<String>,
)

@Serializable
private data class ValidateActionRequest(val actionId: String, val approved: ActionApproval)

@Serializable
private data class AnswerQuestionRequest(val actionId: String, val answer: UserQuestionAnswer)
