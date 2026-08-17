package com.dust.mobile.android.ui.auth

import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.User

internal const val LOGIN_CALLBACK_GRACE_MS = 1_500L
internal const val SESSION_EXPIRED_NOTICE = "Your session expired. Sign in again to continue."
internal const val FRAME_SIGN_IN_NOTICE = "Sign in to view this shared frame."

sealed interface AuthUiState {
    data object Loading : AuthUiState
    data class Unauthenticated(val notice: String? = null) : AuthUiState
    data object Authenticating : AuthUiState
    data class Authenticated(
        val user: User,
        val tokenProvider: TokenProvider,
        val sessionKey: String,
        val isLocalPreview: Boolean = false,
    ) : AuthUiState
    data class Error(val message: String) : AuthUiState
}
