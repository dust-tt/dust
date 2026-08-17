package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.config.withQuery
import com.dust.mobile.core.model.CreatePodTaskRequest
import com.dust.mobile.core.model.PodDetails
import com.dust.mobile.core.model.PodDetailsResponse
import com.dust.mobile.core.model.PodFileEntry
import com.dust.mobile.core.model.PodFilesResponse
import com.dust.mobile.core.model.PodNotificationCondition
import com.dust.mobile.core.model.PodNotificationPreference
import com.dust.mobile.core.model.PodNotificationPreferenceResponse
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.PodTaskResponse
import com.dust.mobile.core.model.PodTaskStatus
import com.dust.mobile.core.model.PodTasksResponse
import com.dust.mobile.core.model.UpdatePodMetadataRequest
import com.dust.mobile.core.model.UpdatePodNotificationPreferenceRequest
import com.dust.mobile.core.model.UpdatePodTaskRequest
import com.dust.mobile.core.model.UpdatePodTaskSuggestionsRequest
import com.dust.mobile.core.model.periodQueryValue
import com.dust.mobile.core.network.ApiClient
import com.dust.mobile.core.network.HttpMethod

class PodRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchDetails(
        workspaceId: String,
        podId: String,
        tokenProvider: TokenProvider,
    ): PodDetails = apiClient.authenticatedGet<PodDetailsResponse>(
        withQuery(Endpoints.space(workspaceId, podId), mapOf("includeAllMembers" to "true")),
        tokenProvider,
    ).space

    suspend fun fetchFiles(
        workspaceId: String,
        podId: String,
        tokenProvider: TokenProvider,
    ): List<PodFileEntry> = apiClient.authenticatedGet<PodFilesResponse>(
        Endpoints.podFiles(workspaceId, podId),
        tokenProvider,
    ).files

    suspend fun fetchTasks(
        workspaceId: String,
        podId: String,
        filter: PodTaskFilter,
        tokenProvider: TokenProvider,
    ): List<PodTask> = apiClient.authenticatedGet<PodTasksResponse>(
        withQuery(
            Endpoints.podTasks(workspaceId, podId),
            mapOf("period" to filter.periodQueryValue(), "people" to "all"),
        ),
        tokenProvider,
    ).tasks

    suspend fun createTask(
        workspaceId: String,
        podId: String,
        text: String,
        tokenProvider: TokenProvider,
    ): PodTask = apiClient.authenticatedPost<CreatePodTaskRequest, PodTaskResponse>(
        Endpoints.podTasks(workspaceId, podId),
        CreatePodTaskRequest(text = text),
        tokenProvider,
    ).task

    suspend fun updateTaskStatus(
        workspaceId: String,
        podId: String,
        taskId: String,
        status: PodTaskStatus,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedSend(
            endpoint = Endpoints.podTask(workspaceId, podId, taskId),
            method = HttpMethod.PATCH,
            body = UpdatePodTaskRequest(status),
            tokenProvider = tokenProvider,
        )
    }

    suspend fun fetchNotificationPreference(
        workspaceId: String,
        podId: String,
        tokenProvider: TokenProvider,
    ): PodNotificationPreference = apiClient.authenticatedGet<PodNotificationPreferenceResponse>(
        Endpoints.podNotificationPreferences(workspaceId, podId),
        tokenProvider,
    ).userProjectNotificationPreference

    suspend fun updateNotificationPreference(
        workspaceId: String,
        podId: String,
        preference: PodNotificationCondition,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedSend(
            endpoint = Endpoints.podNotificationPreferences(workspaceId, podId),
            method = HttpMethod.PATCH,
            body = UpdatePodNotificationPreferenceRequest(preference),
            tokenProvider = tokenProvider,
        )
    }

    suspend fun updatePinnedFrame(
        workspaceId: String,
        podId: String,
        path: String?,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedSend(
            endpoint = Endpoints.podMetadata(workspaceId, podId),
            method = HttpMethod.PATCH,
            body = UpdatePodMetadataRequest(pinnedFramePath = path),
            tokenProvider = tokenProvider,
        )
    }

    suspend fun updateTaskSuggestions(
        workspaceId: String,
        podId: String,
        enabled: Boolean,
        tokenProvider: TokenProvider,
    ) {
        apiClient.authenticatedSend(
            endpoint = Endpoints.podMetadata(workspaceId, podId),
            method = HttpMethod.PATCH,
            body = UpdatePodTaskSuggestionsRequest(todoGenerationEnabled = enabled),
            tokenProvider = tokenProvider,
        )
    }
}
