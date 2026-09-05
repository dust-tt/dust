package com.dust.mobile.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewUser
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.AuthResponse
import com.dust.mobile.core.model.AuthTokens
import com.dust.mobile.core.model.User
import com.dust.mobile.core.network.ApiError
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AuthViewModel(
    private val graph: AppGraph,
) : ViewModel() {
    private val _state = MutableStateFlow<AuthUiState>(AuthUiState.Loading)
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    private var pendingCodeVerifier: String? = graph.tokenStore.loadPendingCodeVerifier()
    private var loginReturnJob: Job? = null
    private var localPreviewActive = false
    private var sessionCounter = 0

    init {
        if (pendingCodeVerifier != null) {
            _state.value = AuthUiState.Authenticating
        }
        restoreSession()
    }

    fun startLogin(openUrl: (String) -> Unit) {
        startAuth(openUrl, graph.authService::buildLoginUrl)
    }

    fun startSignUp(openUrl: (String) -> Unit) {
        startAuth(openUrl, graph.authService::buildSignUpUrl)
    }

    fun startLocalPreview() {
        if (!graph.localAuthBypassEnabled) return
        localPreviewActive = true
        loginReturnJob?.cancel()
        clearPendingAuth()
        val user = localPreviewUser()
        val provider = graph.localPreviewTokenProvider { handleSessionExpired() }
        _state.value = AuthUiState.Authenticated(
            user = user,
            tokenProvider = provider,
            sessionKey = nextSessionKey(user),
            isLocalPreview = true,
        )
    }

    private fun startAuth(
        openUrl: (String) -> Unit,
        buildAuthUrl: (String) -> String,
    ) {
        localPreviewActive = false
        val pkce = runCatching { graph.authService.generatePkce() }.getOrElse { error ->
            _state.value = AuthUiState.Error(error.message ?: "Failed to start login")
            return
        }
        pendingCodeVerifier = pkce.codeVerifier
        graph.tokenStore.savePendingCodeVerifier(pkce.codeVerifier)
        loginReturnJob?.cancel()
        _state.value = AuthUiState.Authenticating
        openUrl(buildAuthUrl(pkce.codeChallenge))
    }

    fun handleCallback(callbackUrl: String) {
        localPreviewActive = false
        val code = graph.authService.extractCode(callbackUrl)
        val verifier = pendingCodeVerifier ?: graph.tokenStore.loadPendingCodeVerifier()
        loginReturnJob?.cancel()
        if (code == null || verifier == null) {
            clearPendingAuth()
            _state.value = AuthUiState.Error("No authorization code received")
            return
        }

        viewModelScope.launch {
            runCatching {
                graph.authService.exchangeCodeForTokens(code, verifier)
            }.onSuccess { response ->
                graph.tokenStore.saveTokens(response)
                clearPendingAuth()
                publishAuthenticatedSession(response)
            }.onFailure { error ->
                clearPendingAuth()
                _state.value = AuthUiState.Error(error.message ?: "Authentication failed")
            }
        }
    }

    fun handleLoginBrowserReturn() {
        pendingCodeVerifier = pendingCodeVerifier ?: graph.tokenStore.loadPendingCodeVerifier()
        if (pendingCodeVerifier == null || _state.value !is AuthUiState.Authenticating) return
        scheduleLoginReturnFallback()
    }

    fun logout() {
        if (localPreviewActive) {
            localPreviewActive = false
            loginReturnJob?.cancel()
            clearPendingAuth()
            graph.clearPersistedSession()
            _state.value = AuthUiState.Loading
            restoreSession()
            return
        }
        localPreviewActive = false
        loginReturnJob?.cancel()
        val tokens = graph.tokenStore.loadTokens()
        clearPendingAuth()
        val authenticatedState = _state.value as? AuthUiState.Authenticated
        if (authenticatedState == null || tokens == null) {
            graph.tokenStore.clearTokens()
            graph.clearPersistedSession()
            _state.value = AuthUiState.Unauthenticated()
            return
        }
        _state.value = AuthUiState.Loading
        viewModelScope.launch {
            graph.tokenStore.clearTokens()
            graph.clearPersistedSession()
            _state.value = AuthUiState.Unauthenticated()
            runCatching { graph.authService.serverLogout(tokens.accessToken) }
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            val tokens = graph.tokenStore.loadTokens()
            if (localPreviewActive) return@launch
            if (tokens == null) {
                _state.value = if (pendingCodeVerifier == null) {
                    AuthUiState.Unauthenticated()
                } else {
                    AuthUiState.Authenticating
                }
                if (pendingCodeVerifier != null) {
                    scheduleLoginReturnFallback()
                }
                return@launch
            }

            clearPendingAuth()
            val cachedUser = graph.offlineCacheRepository.cachedAuthenticatedUser()
            try {
                val response = graph.authService.refreshTokens(tokens.refreshToken)
                graph.tokenStore.saveTokens(response)
                if (localPreviewActive) return@launch
                publishAuthenticatedSession(response)
            } catch (error: Exception) {
                if (localPreviewActive) return@launch
                if (error is ApiError.Network && cachedUser != null) {
                    publishAuthenticatedSession(tokens, cachedUser)
                    return@launch
                }
                graph.tokenStore.clearTokens()
                graph.clearPersistedSession()
                _state.value = AuthUiState.Unauthenticated(notice = SESSION_EXPIRED_NOTICE)
            }
        }
    }

    private fun handleSessionExpired() {
        localPreviewActive = false
        loginReturnJob?.cancel()
        graph.tokenStore.clearTokens()
        graph.clearPersistedSession()
        clearPendingAuth()
        _state.value = AuthUiState.Unauthenticated(notice = SESSION_EXPIRED_NOTICE)
    }

    private fun publishAuthenticatedSession(response: AuthResponse) {
        val provider = graph.tokenProvider(response) { handleSessionExpired() }
        publishAuthenticatedSession(response.user, provider)
    }

    private fun publishAuthenticatedSession(tokens: AuthTokens, user: User) {
        val provider = graph.tokenProvider(tokens) { handleSessionExpired() }
        publishAuthenticatedSession(user, provider)
    }

    private fun publishAuthenticatedSession(user: User, provider: TokenProvider) {
        _state.value = AuthUiState.Authenticated(user, provider, nextSessionKey(user))
        viewModelScope.launch {
            graph.offlineCacheRepository.activateUser(user)
            graph.outboxRepository.schedule()
            graph.catchUpWidgetController.schedulePeriodicRefresh()

        }
    }

    private fun clearPendingAuth() {
        pendingCodeVerifier = null
        graph.tokenStore.clearPendingCodeVerifier()
    }

    private fun scheduleLoginReturnFallback() {
        loginReturnJob?.cancel()
        loginReturnJob = viewModelScope.launch {
            delay(LOGIN_CALLBACK_GRACE_MS)
            if (_state.value is AuthUiState.Authenticating) {
                clearPendingAuth()
                _state.value = AuthUiState.Unauthenticated()
            }
        }
    }

    private fun nextSessionKey(user: User): String {
        sessionCounter += 1
        return "${user.id}-$sessionCounter"
    }

}
