package com.dust.mobile.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.share.IncomingShare
import com.dust.mobile.android.ui.auth.AuthUiState
import com.dust.mobile.android.ui.auth.AuthViewModel
import com.dust.mobile.android.ui.auth.FRAME_SIGN_IN_NOTICE
import com.dust.mobile.android.ui.auth.LoginScreen
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.LoadingScreen
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.frame.FrameShareViewer
import com.dust.mobile.android.ui.navigation.AuthenticatedApp
import com.dust.mobile.android.ui.navigation.AppKeyboardCommand
import com.dust.mobile.core.config.DeepLinkRouter
import com.dust.mobile.core.config.DeepLinkTarget
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

@Composable
internal fun DustApp(
    graph: AppGraph,
    pendingDeepLink: StateFlow<String?>,
    pendingShare: StateFlow<IncomingShare?>,
    keyboardCommands: Flow<AppKeyboardCommand>,
    openUrl: (String) -> Unit,
    clearDeepLink: () -> Unit,
    clearShare: () -> Unit,
) {
    val authViewModel: AuthViewModel = viewModel(factory = factory { AuthViewModel(graph) })
    val sessionViewModelStoreHolder: SessionViewModelStoreHolder = viewModel(
        key = "dust-session-view-model-store",
    )
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    val deepLink by pendingDeepLink.collectAsStateWithLifecycle()
    val share by pendingShare.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    var frameUrl by remember { mutableStateOf<String?>(null) }
    var authenticatedDeepLink by remember { mutableStateOf<DeepLinkTarget?>(null) }
    var authenticatedShare by remember { mutableStateOf<IncomingShare?>(null) }

    LaunchedEffect(deepLink) {
        val url = deepLink ?: return@LaunchedEffect
        when (
            val target = DeepLinkRouter.resolve(
                rawUrl = url,
                appUrl = graph.config.appUrl,
                callbackScheme = graph.config.callbackScheme,
                callbackHost = graph.config.callbackHost,
                allowLocalPreview = graph.localAuthBypassEnabled,
            )
        ) {
            is DeepLinkTarget.Auth -> authViewModel.handleCallback(target.callbackUrl)
            is DeepLinkTarget.Frame -> frameUrl = target.frameUrl
            is DeepLinkTarget.Conversation,
            is DeepLinkTarget.Pod,
            is DeepLinkTarget.NewConversation,
            DeepLinkTarget.CatchUp,
            -> authenticatedDeepLink = target
            DeepLinkTarget.LocalPreview -> authViewModel.startLocalPreview()
            null -> Unit
        }
        clearDeepLink()
    }
    LaunchedEffect(share) {
        val incomingShare = share ?: return@LaunchedEffect
        authenticatedShare = incomingShare
        clearShare()
    }
    LaunchedEffect(frameUrl) {
        if (frameUrl != null) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }
    LaunchedEffect(authState, sessionViewModelStoreHolder) {
        if (authState !is AuthUiState.Authenticated) {
            sessionViewModelStoreHolder.clearSession()
        }
    }
    DisposableEffect(lifecycleOwner, authViewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                authViewModel.handleLoginBrowserReturn()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    BackHandler(enabled = authState is AuthUiState.Authenticated && frameUrl != null) {
        frameUrl = null
    }

    Box(Modifier.fillMaxSize()) {
        when (val state = authState) {
            AuthUiState.Loading -> LoadingScreen(message = "Loading Dust")
            AuthUiState.Authenticating -> LoadingScreen(message = "Opening secure sign-in")
            is AuthUiState.Unauthenticated -> LoginScreen(
                onLogin = { authViewModel.startLogin(openUrl) },
                onSignUp = { authViewModel.startSignUp(openUrl) },
                onLocalPreview = if (graph.localAuthBypassButtonEnabled) authViewModel::startLocalPreview else null,
                notice = state.notice ?: frameUrl?.let { FRAME_SIGN_IN_NOTICE },
            )
            is AuthUiState.Error -> ErrorScreen(message = state.message, onRetry = authViewModel::logout)
            is AuthUiState.Authenticated -> SessionViewModelScope(
                sessionKey = state.sessionKey,
                storeHolder = sessionViewModelStoreHolder,
            ) {
                AuthenticatedApp(
                    graph = graph,
                    user = state.user,
                    tokenProvider = state.tokenProvider,
                    isLocalPreview = state.isLocalPreview,
                    pendingDeepLink = authenticatedDeepLink,
                    onDeepLinkHandled = { authenticatedDeepLink = null },
                    pendingShare = authenticatedShare,
                    keyboardCommands = keyboardCommands,
                    onShareHandled = { authenticatedShare = null },
                    openUrl = openUrl,
                    onLogout = authViewModel::logout,
                )
            }
        }
        if (authState is AuthUiState.Authenticated) {
            frameUrl?.let { url ->
                FrameShareViewer(url = url, onDismiss = { frameUrl = null })
            }
        }
    }
}

@Composable
private fun SessionViewModelScope(
    sessionKey: String,
    storeHolder: SessionViewModelStoreHolder,
    content: @Composable () -> Unit,
) {
    val owner = remember(storeHolder, sessionKey) { storeHolder.ownerFor(sessionKey) }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
        content()
    }
}

internal class SessionViewModelStoreHolder : ViewModel() {
    private var sessionKey: String? = null
    private var store: ViewModelStore? = null

    fun ownerFor(key: String): ViewModelStoreOwner {
        if (sessionKey != key || store == null) {
            store?.clear()
            sessionKey = key
            store = ViewModelStore()
        }
        return SessionViewModelStoreOwner(checkNotNull(store))
    }

    fun clearSession() {
        store?.clear()
        store = null
        sessionKey = null
    }

    override fun onCleared() {
        store?.clear()
    }
}

private class SessionViewModelStoreOwner(
    override val viewModelStore: ViewModelStore,
) : ViewModelStoreOwner
