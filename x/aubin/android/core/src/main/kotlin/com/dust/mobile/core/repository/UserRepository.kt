package com.dust.mobile.core.repository

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.Endpoints
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.DustUserResponse
import com.dust.mobile.core.network.ApiClient

class UserRepository(
    private val apiClient: ApiClient,
) {
    suspend fun fetchDustUser(tokenProvider: TokenProvider): DustUser =
        apiClient.authenticatedGet<DustUserResponse>(Endpoints.USER, tokenProvider).user
}
