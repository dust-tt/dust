package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.SpaceSummaryResponse
import com.dust.mobile.core.model.SpacesResponse
import com.dust.mobile.core.network.ApiClient

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
