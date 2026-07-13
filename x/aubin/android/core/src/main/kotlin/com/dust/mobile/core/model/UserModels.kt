package com.dust.mobile.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val email: String,
    val emailVerified: Boolean = false,
    val firstName: String? = null,
    val lastName: String? = null,
    val profilePictureUrl: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
) {
    val displayName: String
        get() = listOfNotNull(firstName, lastName).joinToString(" ").ifBlank { email }
}

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: User,
    val expiresIn: Long? = null,
)

@Serializable
data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class Workspace(
    val sId: String,
    val name: String,
    val role: String,
)

@Serializable
data class DustUser(
    val sId: String,
    val firstName: String,
    val lastName: String? = null,
    val image: String? = null,
    val workspaces: List<Workspace>,
    val selectedWorkspace: String? = null,
)

@Serializable
data class DustUserResponse(
    val user: DustUser,
)

@Serializable
data class TokenExchangeRequest(
    val code: String,
    @SerialName("code_verifier")
    val codeVerifier: String,
)

@Serializable
data class TokenRefreshRequest(
    @SerialName("grant_type")
    val grantType: String = "refresh_token",
    @SerialName("refresh_token")
    val refreshToken: String,
)

@Serializable
data class LightAgentConfiguration(
    val sId: String,
    val name: String,
    val description: String,
    val pictureUrl: String? = null,
    val scope: String,
    val userFavorite: Boolean = false,
)

@Serializable
data class AgentConfigurationsResponse(
    val agentConfigurations: List<LightAgentConfiguration>,
)
