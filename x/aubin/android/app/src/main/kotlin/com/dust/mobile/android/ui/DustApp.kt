package com.dust.mobile.android.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.util.Base64
import android.util.LruCache
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.Image
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.R
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.config.DeepLinkRouter
import com.dust.mobile.core.config.DeepLinkTarget
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.CatchUpSwipeAction
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationAttachment
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.AttachmentPreviewRoute
import com.dust.mobile.core.model.AttachmentCategory
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.ActionApproval
import com.dust.mobile.core.model.CitationDisplayEntry
import com.dust.mobile.core.model.ErrorInfo
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.ActivityTimelineRow
import com.dust.mobile.core.model.ActivityTimelineRowKind
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MarkdownBlock
import com.dust.mobile.core.model.MarkdownInline
import com.dust.mobile.core.model.MarkdownTableCell
import com.dust.mobile.core.model.RenderedMarkdownDocument
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.SUPPORTED_UPLOAD_MIME_TYPES
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.UserQuestion
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.Workspace
import com.dust.mobile.core.model.activeCitationEntries
import com.dust.mobile.core.model.activityTimelineDisplay
import com.dust.mobile.core.model.attachmentPreviewRoute
import com.dust.mobile.core.model.buildUserQuestionAnswer
import com.dust.mobile.core.model.canRespondToBlockedAction
import com.dust.mobile.core.model.catchUpSwipeAction
import com.dust.mobile.core.model.buildFrameWrapperHtml
import com.dust.mobile.core.model.decodeUtf8TextOrNull
import com.dust.mobile.core.model.displayableGeneratedFiles
import com.dust.mobile.core.model.favoriteLabel
import com.dust.mobile.core.model.filterSelectableCapabilities
import com.dust.mobile.core.model.filterAgents
import com.dust.mobile.core.model.iconLabelForContentType
import com.dust.mobile.core.model.FRAME_CONTENT_TYPE_PREFIX
import com.dust.mobile.core.model.isCurrentUserMessage
import com.dust.mobile.core.model.isImageContentType
import com.dust.mobile.core.model.inlineBlockedStateForMessage
import com.dust.mobile.core.model.parseEmojiAvatarUrl
import com.dust.mobile.core.model.renderAgentMessage
import com.dust.mobile.core.model.renderMessageMarkdown
import com.dust.mobile.core.model.replyCountLabel
import com.dust.mobile.core.model.selectableKnowledgeItems
import com.dust.mobile.core.model.steeredAgentHeaderMessageIds
import com.dust.mobile.core.model.toolApprovalDisplay
import com.dust.mobile.core.model.visibilityLabel
import com.dust.mobile.core.repository.FrameFileContent
import com.dust.mobile.core.stream.AgentMessageStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

private const val PHOTO_PICKER_MAX_ITEMS = 10
private const val CATCH_UP_CARD_ANIMATION_MS = 220
private const val CATCH_UP_EXIT_DISTANCE_DP = 420
private const val CATCH_UP_SWIPE_HINT_DP = 30
private const val CATCH_UP_SWIPE_THRESHOLD_DP = 80
private const val AVATAR_CONNECT_TIMEOUT_MS = 5_000
private const val AVATAR_READ_TIMEOUT_MS = 5_000
private val COMPOSE_QUICK_STARTS = listOf(
    "Draft customer brief",
    "Summarize updates",
)

@Composable
fun DustApp(
    graph: AppGraph,
    pendingDeepLink: StateFlow<String?>,
    openUrl: (String) -> Unit,
    clearDeepLink: () -> Unit,
) {
    val authViewModel: AuthViewModel = viewModel(factory = factory { AuthViewModel(graph) })
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    val deepLink by pendingDeepLink.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    var frameUrl by remember { mutableStateOf<String?>(null) }

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
            DeepLinkTarget.LocalPreview -> authViewModel.startLocalPreview()
            null -> Unit
        }
        clearDeepLink()
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
            is AuthUiState.Authenticated -> SessionViewModelScope(state.sessionKey) {
                AuthenticatedApp(
                    graph = graph,
                    user = state.user,
                    tokenProvider = state.tokenProvider,
                    isLocalPreview = state.isLocalPreview,
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
    content: @Composable () -> Unit,
) {
    val store = remember(sessionKey) { ViewModelStore() }
    val owner = remember(store) {
        object : ViewModelStoreOwner {
            override val viewModelStore: ViewModelStore = store
        }
    }
    DisposableEffect(store) {
        onDispose { store.clear() }
    }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
        content()
    }
}

@Composable
private fun LoadingScreen(message: String = "Loading") {
    val pulse = rememberInfiniteTransition(label = "dust-loading")
    val scale by pulse.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "dust-loading-scale",
    )
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.dust_logo),
            contentDescription = stringResource(R.string.dust_logo_content_description),
            modifier = Modifier
                .size(width = 112.dp, height = 28.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    alpha = 0.7f + (scale - 0.96f) * 3f
                },
        )
        if (message != "Loading") {
            Spacer(Modifier.height(16.dp))
            Text(
                message,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun LoginScreen(
    onLogin: () -> Unit,
    onSignUp: () -> Unit,
    onLocalPreview: (() -> Unit)? = null,
    notice: String? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.dust_logo),
                contentDescription = stringResource(R.string.dust_logo_content_description),
                modifier = Modifier.size(width = 144.dp, height = 36.dp),
            )
            Text(
                "The Operating System for AI Agents",
                color = MaterialTheme.colorScheme.onBackground,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Normal,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(32.dp))
        val visibleNotice = notice?.takeIf { it.isNotBlank() }
        if (visibleNotice != null) {
            LoginNotice(visibleNotice)
            Spacer(Modifier.height(12.dp))
        }
        Button(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            onClick = onLogin,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.onBackground,
                contentColor = MaterialTheme.colorScheme.background,
            ),
            shape = RoundedCornerShape(15.dp),
        ) {
            Text("Sign in")
        }
        Spacer(Modifier.height(12.dp))
        OutlinedButton(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            onClick = onSignUp,
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = MaterialTheme.colorScheme.onBackground,
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.2f)),
            shape = RoundedCornerShape(15.dp),
        ) {
            Text("Sign up")
        }
        if (onLocalPreview != null) {
            Spacer(Modifier.height(8.dp))
            TextButton(
                modifier = Modifier.fillMaxWidth(),
                onClick = onLocalPreview,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            ) {
                Text("Try sample workspace")
            }
        }
        Spacer(Modifier.height(48.dp))
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun LoginNotice(message: String) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 360.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            message,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.dust_logo_square),
            contentDescription = stringResource(R.string.dust_logo_content_description),
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "Something went wrong",
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            message,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(22.dp))
        Button(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 320.dp),
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.onBackground,
                contentColor = MaterialTheme.colorScheme.background,
            ),
            shape = RoundedCornerShape(15.dp),
        ) {
            Text("Try Again")
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun FrameShareViewer(url: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var pageTitle by remember(url) { mutableStateOf("") }
    var isLoading by remember(url) { mutableStateOf(true) }
    var webViewRestartKey by remember(url) { mutableStateOf(0) }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                pageTitle.ifEmpty { "Frame" },
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleLarge,
            )
            TextButton(
                onClick = {
                    val shareIntent = Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_TEXT, url)
                    context.startActivity(Intent.createChooser(shareIntent, "Share frame"))
                },
            ) {
                Text("Share")
            }
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
        Box(Modifier.fillMaxSize()) {
            key(webViewRestartKey) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        WebView(context).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            webChromeClient = object : WebChromeClient() {
                                override fun onReceivedTitle(view: WebView?, title: String?) {
                                    if (!title.isNullOrBlank()) {
                                        pageTitle = title
                                    }
                                }
                            }
                            webViewClient = embeddedWebViewClient(
                                allowedUrl = url,
                                openExternal = { externalUrl ->
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(externalUrl)))
                                    }
                                },
                                onLoadingChange = { isLoading = it },
                                onRendererGone = {
                                    isLoading = true
                                    webViewRestartKey += 1
                                },
                            )
                            loadUrl(url)
                        }
                    },
                    update = { webView ->
                        if (webView.url != url) {
                            webView.loadUrl(url)
                        }
                    },
                )
            }
            if (isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

private sealed interface Destination {
    data object Compose : Destination
    data object List : Destination
    data class CatchUp(val conversations: kotlin.collections.List<Conversation>) : Destination
    data class PodConversations(val space: Space) : Destination
    data class PodCompose(val space: Space) : Destination
    data class ConversationDetail(val conversation: Conversation, val returnTo: Destination = List) : Destination
    data class ConversationFiles(val conversation: Conversation, val returnTo: Destination) : Destination
    data class AttachmentViewer(
        val title: String,
        val contentType: String,
        val fileId: String,
        val sourceUrl: String?,
        val returnTo: Destination,
    ) : Destination
}

private fun Destination.backDestinationOrNull(): Destination? =
    when (this) {
        Destination.List -> null
        Destination.Compose -> Destination.List
        is Destination.CatchUp -> null
        is Destination.PodConversations -> Destination.List
        is Destination.PodCompose -> Destination.PodConversations(space)
        is Destination.ConversationDetail -> returnTo
        is Destination.ConversationFiles -> returnTo
        is Destination.AttachmentViewer -> returnTo
    }

private val Destination.label: String
    get() = when (this) {
        Destination.Compose -> "New conversation"
        Destination.List -> "Inbox"
        is Destination.CatchUp -> "Catch up"
        is Destination.PodConversations -> space.name
        is Destination.PodCompose -> "New in ${space.name}"
        is Destination.ConversationDetail -> conversation.title ?: "Conversation"
        is Destination.ConversationFiles -> "Conversation Files"
        is Destination.AttachmentViewer -> title
    }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedApp(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    openUrl: (String) -> Unit,
    onLogout: () -> Unit,
) {
    val listViewModel: ConversationListViewModel = viewModel(
        key = "conversation-list",
        factory = factory { ConversationListViewModel(graph, tokenProvider, isLocalPreview) },
    )
    val listState by listViewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    var destination by remember { mutableStateOf<Destination>(Destination.List) }
    val backDestination = destination.backDestinationOrNull()

    BackHandler(enabled = backDestination != null) {
        backDestination?.let { destination = it }
    }

    LaunchedEffect(Unit) {
        listViewModel.load()
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                listViewModel.refreshSilently()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Scaffold(
        topBar = {
            if (destination != Destination.List && destination !is Destination.CatchUp) {
                CenterAlignedTopAppBar(
                    title = {
                        if (destination != Destination.Compose) {
                            Text(
                                destination.label,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    },
                    navigationIcon = {
                        val target = backDestination
                        if (target != null) {
                            IconButton(onClick = { destination = target }) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_arrow_back_24),
                                    contentDescription = "Back",
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    },
                    actions = {
                        when (val current = destination) {
                            is Destination.ConversationDetail -> {
                                ToolbarIconButton(
                                    onClick = {
                                        destination = Destination.ConversationFiles(
                                            conversation = current.conversation,
                                            returnTo = current,
                                        )
                                    },
                                    iconRes = R.drawable.ic_attach_file_24,
                                    contentDescription = "Conversation files",
                                )
                                if (!isLocalPreview) {
                                    ToolbarIconButton(
                                        onClick = {
                                            listState.workspace?.let { workspace ->
                                                openUrl(
                                                    graph.config.conversationUrl(
                                                        workspace.sId,
                                                        current.conversation.sId,
                                                    ),
                                                )
                                            }
                                        },
                                        iconRes = R.drawable.ic_open_in_browser_24,
                                        contentDescription = "Open conversation in browser",
                                    )
                                }
                            }
                            else -> Unit
                        }
                    },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        scrolledContainerColor = MaterialTheme.colorScheme.background,
                    ),
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
        ) {
            Box(Modifier.weight(1f)) {
            val workspace = listState.workspace
            when {
                listState.isLoading -> LoadingScreen()
                listState.error != null -> ErrorScreen(
                    message = listState.error ?: "Failed to load",
                    onRetry = listViewModel::load,
                )
                workspace == null -> ErrorScreen("No workspace found", listViewModel::load)
                else -> AnimatedContent(
                    targetState = destination,
                    transitionSpec = {
                        (fadeIn(tween(170)) + slideInVertically(tween(170)) { height -> height / 36 })
                            .togetherWith(fadeOut(tween(110)))
                    },
                    label = "destination",
                ) { current ->
                    when (current) {
                    Destination.Compose -> ComposeScreen(
                        graph = graph,
                        user = user,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        onCreated = { conversation ->
                            listViewModel.refresh()
                            destination = Destination.ConversationDetail(conversation, returnTo = Destination.List)
                        },
                    )
                    Destination.List -> ConversationListScreen(
                        state = listState,
                        user = user,
                        isLocalPreview = isLocalPreview,
                        onSearch = listViewModel::updateSearch,
                        onSwitchWorkspace = listViewModel::switchWorkspace,
                        onLogout = onLogout,
                        onNewConversation = { destination = Destination.Compose },
                        onSelectPod = { destination = Destination.PodConversations(it) },
                        onTogglePodsExpanded = listViewModel::togglePodsExpanded,
                        onSelectConversation = {
                            destination = Destination.ConversationDetail(it, returnTo = Destination.List)
                        },
                        onToggleRead = listViewModel::toggleReadStatus,
                        onDelete = listViewModel::deleteConversation,
                        onCatchUp = listState.unreadConversations.takeIf { it.isNotEmpty() }?.let { unread ->
                            { destination = Destination.CatchUp(unread) }
                        },
                        onRefresh = listViewModel::refresh,
                    )
                    is Destination.CatchUp -> CatchUpScreen(
                        graph = graph,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        currentUserEmail = user.email,
                        conversations = current.conversations,
                        onDismiss = { markedIds ->
                            listViewModel.markConversationsAsRead(markedIds)
                            destination = Destination.List
                        },
                        onOpenConversation = { markedIds, conversation ->
                            listViewModel.markConversationsAsRead(markedIds)
                            destination = Destination.ConversationDetail(conversation, returnTo = Destination.List)
                        },
                    )
                    is Destination.PodConversations -> PodConversationsScreen(
                        graph = graph,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        space = current.space,
                        onSelectConversation = {
                            destination = Destination.ConversationDetail(
                                it,
                                returnTo = Destination.PodConversations(current.space),
                            )
                        },
                        onNewConversation = { destination = Destination.PodCompose(current.space) },
                    )
                    is Destination.PodCompose -> ComposeScreen(
                        graph = graph,
                        user = user,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        spaceId = current.space.sId,
                        onCreated = { conversation ->
                            listViewModel.refresh()
                            destination = Destination.ConversationDetail(
                                conversation,
                                returnTo = Destination.PodConversations(current.space),
                            )
                        },
                    )
                    is Destination.ConversationDetail -> {
                        val podReturnViewModel = (current.returnTo as? Destination.PodConversations)?.let { pod ->
                            viewModel<PodConversationsViewModel>(
                                key = "pod-${pod.space.sId}",
                                factory = factory {
                                    PodConversationsViewModel(
                                        graph,
                                        tokenProvider,
                                        isLocalPreview,
                                        workspace.sId,
                                        pod.space,
                                    )
                                },
                            )
                        }
                        ConversationDetailScreen(
                            graph = graph,
                            user = user,
                            tokenProvider = tokenProvider,
                            isLocalPreview = isLocalPreview,
                            workspaceId = workspace.sId,
                            conversation = current.conversation,
                            currentUserSId = listState.dustUser?.sId,
                            onOpenInBrowser = if (isLocalPreview) null else {
                                { openUrl(graph.config.conversationUrl(workspace.sId, current.conversation.sId)) }
                            },
                            onTitleChanged = { title ->
                                listViewModel.updateConversationTitle(current.conversation.sId, title)
                                podReturnViewModel?.updateConversationTitle(current.conversation.sId, title)
                            },
                            onMarkedAsRead = {
                                listViewModel.markConversationsAsRead(setOf(current.conversation.sId))
                                podReturnViewModel?.markConversationAsRead(current.conversation.sId)
                            },
                            onOpenContentFragment = { fragment ->
                                val fileId = fragment.fileId ?: return@ConversationDetailScreen
                                destination = Destination.AttachmentViewer(
                                    title = fragment.title,
                                    contentType = fragment.contentType,
                                    fileId = fileId,
                                    sourceUrl = fragment.sourceUrl,
                                    returnTo = current,
                                )
                            },
                            onOpenFile = { file ->
                                val fileId = file.fileId ?: return@ConversationDetailScreen
                                destination = Destination.AttachmentViewer(
                                    title = file.title,
                                    contentType = file.contentType,
                                    fileId = fileId,
                                    sourceUrl = null,
                                    returnTo = current,
                                )
                            },
                        )
                    }
                    is Destination.ConversationFiles -> ConversationFilesScreen(
                        graph = graph,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        conversation = current.conversation,
                        onOpenAttachment = { attachment ->
                            val fileId = attachment.fileId ?: return@ConversationFilesScreen
                            destination = Destination.AttachmentViewer(
                                title = attachment.title,
                                contentType = attachment.contentType,
                                fileId = fileId,
                                sourceUrl = attachment.sourceUrl,
                                returnTo = current,
                            )
                        },
                    )
                    is Destination.AttachmentViewer -> AttachmentViewerScreen(
                        graph = graph,
                        tokenProvider = tokenProvider,
                        isLocalPreview = isLocalPreview,
                        workspaceId = workspace.sId,
                        title = current.title,
                        contentType = current.contentType,
                        fileId = current.fileId,
                        sourceUrl = current.sourceUrl,
                    )
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun ToolbarIconButton(
    onClick: () -> Unit,
    iconRes: Int,
    contentDescription: String,
    enabled: Boolean = true,
) {
    val contentColor = if (enabled) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    }
    Surface(
        modifier = Modifier.size(42.dp),
        shape = RoundedCornerShape(4.dp),
        color = Color.Transparent,
        contentColor = contentColor,
    ) {
        IconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxSize(),
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun SearchFieldLeadingIcon() {
    Icon(
        painter = painterResource(R.drawable.ic_search_24),
        contentDescription = null,
        modifier = Modifier.size(20.dp),
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ConversationSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(15.dp)
    Surface(
        modifier = modifier.height(44.dp),
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        BasicTextField(
            modifier = Modifier.fillMaxSize(),
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = MaterialTheme.colorScheme.onSurface,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
            decorationBox = { innerTextField ->
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 14.dp, end = if (value.isEmpty()) 14.dp else 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SearchFieldLeadingIcon()
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (value.isEmpty()) {
                            Text(
                                text = "Search conversations",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        innerTextField()
                    }
                    if (value.isNotEmpty()) {
                        IconButton(
                            onClick = { onValueChange("") },
                            modifier = Modifier.size(36.dp),
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_close_24),
                                contentDescription = "Clear search",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            },
        )
    }
}

@Composable
private fun CommandIconButton(
    onClick: () -> Unit,
    iconRes: Int,
    contentDescription: String,
    emphasized: Boolean = false,
    enabled: Boolean = true,
) {
    val containerColor = if (emphasized) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.surface
    }
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
        emphasized -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        modifier = Modifier.size(44.dp),
        shape = RoundedCornerShape(15.dp),
        color = containerColor,
        contentColor = contentColor,
        border = if (emphasized) null else {
            BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
        },
        shadowElevation = if (emphasized) 1.dp else 0.dp,
    ) {
        IconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxSize(),
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(19.dp),
            )
        }
    }
}

@Composable
private fun CatchUpCommandButton(
    count: Int,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .size(width = 58.dp, height = 46.dp)
            .semantics { contentDescription = "Catch up on $count conversations" }
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        shadowElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_inbox_24),
                contentDescription = null,
                modifier = Modifier.size(17.dp),
            )
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun PodLink(space: Space, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_space_open_24),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            space.name,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun ConversationSectionHeader(label: String) {
    Row(
        modifier = Modifier.padding(start = 16.dp, top = 18.dp, end = 16.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LocalPreviewChip() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(5.dp)
                .background(MaterialTheme.colorScheme.secondary, RoundedCornerShape(1.dp)),
        )
        Text(
            "Sample workspace",
            maxLines = 1,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AccountMenu(
    user: User,
    onLogout: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Box {
        Surface(
            modifier = Modifier
                .padding(end = 4.dp)
                .size(48.dp)
                .semantics { contentDescription = "Account menu" }
                .clickable { expanded = true },
            color = Color.Transparent,
            shape = CircleShape,
        ) {
            Box(contentAlignment = Alignment.Center) {
                DustAvatar(
                    name = user.displayName,
                    avatarUrl = user.profilePictureUrl,
                    size = 30.dp,
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.widthIn(min = 220.dp, max = 280.dp),
            shape = RoundedCornerShape(6.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp,
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text(
                    user.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    user.email,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text("Sign out") },
                onClick = {
                    expanded = false
                    onLogout()
                },
            )
        }
    }
}

@Composable
private fun ConversationRootHeader(
    user: User,
    isLocalPreview: Boolean,
    currentWorkspace: Workspace?,
    workspaces: List<Workspace>,
    onSwitchWorkspace: (Workspace) -> Unit,
    onLogout: () -> Unit,
    onRefresh: () -> Unit,
    onCatchUp: (() -> Unit)?,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, top = 10.dp, end = 16.dp, bottom = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AccountMenu(user = user, onLogout = onLogout)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                Text(
                    user.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (isLocalPreview) {
                    LocalPreviewChip()
                }
            }
            WorkspaceTitlePicker(
                current = currentWorkspace,
                workspaces = workspaces,
                enabled = true,
                onSelect = onSwitchWorkspace,
            )
            ToolbarIconButton(
                onClick = onRefresh,
                iconRes = R.drawable.ic_refresh_24,
                contentDescription = "Refresh conversations",
            )
        }
        if (onCatchUp != null) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clickable(onClick = onCatchUp),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_inbox_24),
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text("Catch Up", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
private fun ConversationListBottomBar(
    searchText: String,
    onSearch: (String) -> Unit,
    onNewConversation: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ConversationSearchField(
            modifier = Modifier.weight(1f),
            value = searchText,
            onValueChange = onSearch,
        )
        CommandIconButton(
            onClick = onNewConversation,
            iconRes = R.drawable.ic_chat_plus_24,
            contentDescription = "New conversation",
        )
    }
}

@Composable
private fun ConversationListScreen(
    state: ConversationListState,
    user: User,
    isLocalPreview: Boolean,
    onSearch: (String) -> Unit,
    onSwitchWorkspace: (Workspace) -> Unit,
    onLogout: () -> Unit,
    onNewConversation: () -> Unit,
    onSelectPod: (Space) -> Unit,
    onTogglePodsExpanded: () -> Unit,
    onSelectConversation: (Conversation) -> Unit,
    onToggleRead: (Conversation) -> Unit,
    onDelete: (Conversation) -> Unit,
    onCatchUp: (() -> Unit)?,
    onRefresh: () -> Unit,
) {
    var conversationToDelete by remember { mutableStateOf<Conversation?>(null) }

    conversationToDelete?.let { conversation ->
        AlertDialog(
            onDismissRequest = { conversationToDelete = null },
            title = { Text("Delete conversation?") },
            text = { Text("This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        conversationToDelete = null
                        onDelete(conversation)
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { conversationToDelete = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        ConversationRootHeader(
            user = user,
            isLocalPreview = isLocalPreview,
            currentWorkspace = state.workspace,
            workspaces = state.workspaces,
            onSwitchWorkspace = onSwitchWorkspace,
            onLogout = onLogout,
            onRefresh = onRefresh,
            onCatchUp = onCatchUp,
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 16.dp),
        ) {
            state.pods.takeIf { it.isNotEmpty() }?.let { pods ->
                item {
                    val chevronRotation by animateFloatAsState(
                        targetValue = if (state.isPodsExpanded) 0f else -90f,
                        animationSpec = tween(durationMillis = 150),
                        label = "pods-chevron",
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(onClick = onTogglePodsExpanded)
                            .height(48.dp)
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Pods",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Icon(
                            painter = painterResource(R.drawable.ic_expand_more_24),
                            contentDescription = if (state.isPodsExpanded) "Collapse pods" else "Expand pods",
                            modifier = Modifier
                                .size(12.dp)
                                .graphicsLayer { rotationZ = chevronRotation },
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (state.isPodsExpanded) {
                    items(pods, key = { "pod-${it.sId}" }) { pod ->
                        PodLink(space = pod, onClick = { onSelectPod(pod) })
                    }
                }
            }
            if (state.groupedConversations.isEmpty()) {
                item {
                    ConversationEmptyState(
                        label = conversationListEmptyLabel(state.searchText),
                        supportingLabel = if (state.searchText.isEmpty()) {
                            "Nothing needs attention right now."
                        } else {
                            null
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                    )
                }
            }
            state.groupedConversations.forEach { group ->
                item {
                    ConversationSectionHeader(
                        if (group.label.startsWith("Inbox")) "Needs attention" else group.label,
                    )
                }
                items(group.conversations, key = { it.sId }) { conversation ->
                    ConversationRow(
                        conversation = conversation,
                        onOpen = { onSelectConversation(conversation) },
                        onToggleRead = { onToggleRead(conversation) },
                        onDelete = { conversationToDelete = conversation },
                    )
                }
            }
        }
        ConversationListBottomBar(
            searchText = state.searchText,
            onSearch = onSearch,
            onNewConversation = onNewConversation,
        )
    }
}

@Composable
private fun CatchUpScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    currentUserEmail: String,
    conversations: List<Conversation>,
    onDismiss: (Set<String>) -> Unit,
    onOpenConversation: (Set<String>, Conversation) -> Unit,
) {
    val catchUpViewModel: CatchUpViewModel = viewModel(
        key = "catch-up-$workspaceId-${conversations.joinToString { it.sId }}",
        factory = factory { CatchUpViewModel(graph, tokenProvider, isLocalPreview, workspaceId, conversations) },
    )
    val state by catchUpViewModel.state.collectAsStateWithLifecycle()
    val currentConversation = state.currentConversation
    val density = LocalDensity.current
    val cardAnimationScope = rememberCoroutineScope()
    val cardExitDistancePx = with(density) { CATCH_UP_EXIT_DISTANCE_DP.dp.toPx() }
    val swipeThresholdPx = with(density) { CATCH_UP_SWIPE_THRESHOLD_DP.dp.toPx() }
    var cardOffsetPx by remember(currentConversation?.sId) { mutableFloatStateOf(0f) }
    var isCardAnimating by remember(currentConversation?.sId) { mutableStateOf(false) }

    fun animateCardTo(targetOffsetPx: Float, onComplete: () -> Unit = {}) {
        if (isCardAnimating) return
        cardAnimationScope.launch {
            isCardAnimating = true
            animate(
                initialValue = cardOffsetPx,
                targetValue = targetOffsetPx,
                animationSpec = tween(
                    durationMillis = CATCH_UP_CARD_ANIMATION_MS,
                    easing = FastOutSlowInEasing,
                ),
            ) { value, _ ->
                cardOffsetPx = value
            }
            cardOffsetPx = 0f
            onComplete()
            isCardAnimating = false
        }
    }

    fun animateCardAction(action: CatchUpSwipeAction) {
        when (action) {
            CatchUpSwipeAction.MARK_AS_READ -> animateCardTo(cardExitDistancePx, catchUpViewModel::markAsRead)
            CatchUpSwipeAction.KEEP_FOR_LATER -> animateCardTo(-cardExitDistancePx, catchUpViewModel::keepForLater)
        }
    }

    BackHandler {
        catchUpViewModel.dismiss(onDismiss)
    }

    LaunchedEffect(state.isDone) {
        if (state.isDone) {
            delay(1500)
            catchUpViewModel.dismiss(onDismiss)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                state.progressText,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Surface(
                modifier = Modifier.size(40.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                IconButton(onClick = { catchUpViewModel.dismiss(onDismiss) }) {
                    Icon(
                        painter = painterResource(R.drawable.ic_close_24),
                        contentDescription = "Close",
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }

        Box(modifier = Modifier.weight(1f)) {
            when {
                state.isDone -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_check_circle_24),
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                        Text("All caught up!", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                currentConversation != null -> CatchUpConversationCard(
                    conversation = currentConversation,
                    messages = state.messages,
                    currentUserEmail = currentUserEmail,
                    isLoading = state.isLoadingMessages,
                    dragOffsetPx = cardOffsetPx,
                    isEnabled = !state.isFlushing && !isCardAnimating,
                    onDrag = { dragAmount -> cardOffsetPx += dragAmount },
                    onDragCancelled = { animateCardTo(0f) },
                    onDragEnded = {
                        catchUpSwipeAction(cardOffsetPx, swipeThresholdPx)?.let(::animateCardAction)
                            ?: animateCardTo(0f)
                    },
                    onOpenConversation = {
                        catchUpViewModel.dismiss { markedIds ->
                            onOpenConversation(markedIds, currentConversation)
                        }
                    },
                )
            }
        }

        state.error?.let { error ->
            Text(
                error,
                modifier = Modifier.padding(horizontal = 16.dp),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        if (!state.isDone) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Button(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    enabled = !state.isFlushing && !isCardAnimating,
                    onClick = { animateCardAction(CatchUpSwipeAction.KEEP_FOR_LATER) },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_clock_24),
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text("Keep for later")
                }
                Button(
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    enabled = !state.isFlushing && !isCardAnimating,
                    onClick = {
                        if (currentConversation?.actionRequired == true) {
                            catchUpViewModel.dismiss { markedIds ->
                                onOpenConversation(markedIds, currentConversation)
                            }
                        } else {
                            animateCardAction(CatchUpSwipeAction.MARK_AS_READ)
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                    ),
                ) {
                    Icon(
                        painter = painterResource(
                            if (currentConversation?.actionRequired == true) {
                                R.drawable.ic_chevron_right_24
                            } else {
                                R.drawable.ic_check_24
                            },
                        ),
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(
                        if (currentConversation?.actionRequired == true) {
                            "Respond"
                        } else {
                            "Mark as read"
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun CatchUpConversationCard(
    conversation: Conversation,
    messages: List<ConversationMessage>,
    currentUserEmail: String,
    isLoading: Boolean,
    dragOffsetPx: Float,
    isEnabled: Boolean,
    onDrag: (Float) -> Unit,
    onDragCancelled: () -> Unit,
    onDragEnded: () -> Unit,
    onOpenConversation: () -> Unit,
) {
    val density = LocalDensity.current
    val swipeHintPx = with(density) { CATCH_UP_SWIPE_HINT_DP.dp.toPx() }
    val swipeThresholdPx = with(density) { CATCH_UP_SWIPE_THRESHOLD_DP.dp.toPx() }
    val rotationDegrees = with(density) { dragOffsetPx.toDp().value } / 25f

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    translationX = dragOffsetPx
                    rotationZ = rotationDegrees
                },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .shadow(8.dp, RoundedCornerShape(16.dp))
                    .clip(RoundedCornerShape(16.dp))
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                    .pointerInput(conversation.sId, isEnabled, swipeThresholdPx) {
                        if (isEnabled) {
                            detectHorizontalDragGestures(
                                onDragCancel = onDragCancelled,
                                onDragEnd = onDragEnded,
                                onHorizontalDrag = { _, dragAmount -> onDrag(dragAmount) },
                            )
                        }
                    },
            ) {
                when {
                    isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    messages.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No messages")
                    }
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 16.dp, top = 56.dp, end = 16.dp, bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(messages, key = { it.id }) { message ->
                            MessageBubble(
                                message = message,
                                currentUserEmail = currentUserEmail,
                            )
                        }
                        if (conversation.actionRequired) {
                            item {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 2.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Box(
                                            Modifier
                                                .size(8.dp)
                                                .background(Color(0xFFFFBE2C), CircleShape),
                                        )
                                        Text(
                                            "This conversation needs your action. Open it to respond.",
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            CatchUpSwipeHint(
                dragOffsetPx = dragOffsetPx,
                hintStartPx = swipeHintPx,
                commitThresholdPx = swipeThresholdPx,
            )
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp)
                    .height(40.dp)
                    .clickable(onClick = onOpenConversation),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                contentColor = MaterialTheme.colorScheme.onSurface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ConversationStatusDot(conversation)
                    Text(
                        conversation.title ?: "New conversation",
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Icon(
                        painter = painterResource(R.drawable.ic_chevron_right_24),
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CatchUpSwipeHint(
    dragOffsetPx: Float,
    hintStartPx: Float,
    commitThresholdPx: Float,
) {
    val isMarkAsRead = dragOffsetPx > hintStartPx
    val isKeepForLater = dragOffsetPx < -hintStartPx
    if (!isMarkAsRead && !isKeepForLater) return

    val progress = ((kotlin.math.abs(dragOffsetPx) - hintStartPx) / (commitThresholdPx - hintStartPx))
        .coerceIn(0f, 1f)
    val color = if (isMarkAsRead) {
        MaterialTheme.colorScheme.secondary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(color.copy(alpha = progress * 0.12f), RoundedCornerShape(16.dp))
            .padding(horizontal = 28.dp),
        contentAlignment = if (isMarkAsRead) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        Column(
            modifier = Modifier.alpha(progress),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                painter = painterResource(
                    if (isMarkAsRead) R.drawable.ic_check_24 else R.drawable.ic_clock_24,
                ),
                contentDescription = null,
                modifier = Modifier.size(26.dp),
                tint = color,
            )
            Text(
                if (isMarkAsRead) "Mark as read" else "Keep for later",
                color = color,
                style = MaterialTheme.typography.labelSmall,
            )
        }
    }
}

@Composable
private fun PodConversationsScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    space: Space,
    onSelectConversation: (Conversation) -> Unit,
    onNewConversation: () -> Unit,
) {
    val podViewModel: PodConversationsViewModel = viewModel(
        key = "pod-${space.sId}",
        factory = factory { PodConversationsViewModel(graph, tokenProvider, isLocalPreview, workspaceId, space) },
    )
    val state by podViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(space.sId) {
        podViewModel.load()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Box(Modifier.weight(1f)) {
            when {
            state.isLoading -> LoadingScreen()
            state.error != null -> ErrorScreen(state.error ?: "Failed to load space", podViewModel::load)
            state.groupedConversations.isEmpty() -> ConversationEmptyState(
                label = podConversationListEmptyLabel(state.searchText),
                supportingLabel = if (state.searchText.isEmpty()) {
                    "Nothing needs attention right now."
                } else {
                    null
                },
                modifier = Modifier.fillMaxSize(),
            )
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 16.dp),
            ) {
                state.groupedConversations.forEach { group ->
                    item {
                        ConversationSectionHeader(group.label)
                    }
                    items(group.conversations, key = { it.sId }) { conversation ->
                        ConversationRow(
                            conversation = conversation,
                            onOpen = { onSelectConversation(conversation) },
                            showActions = false,
                            onToggleRead = {},
                            onDelete = {},
                        )
                    }
                }
            }
            }
        }
        ConversationListBottomBar(
            searchText = state.searchText,
            onSearch = podViewModel::updateSearch,
            onNewConversation = onNewConversation,
        )
    }
}

@Composable
private fun ConversationEmptyState(
    label: String,
    supportingLabel: String?,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(horizontal = 24.dp, vertical = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(
            painter = painterResource(R.drawable.dust_logo_square),
            contentDescription = null,
            modifier = Modifier
                .size(52.dp)
                .alpha(0.86f),
        )
        Text(
            label,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        supportingLabel?.let {
            Text(
                it,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

internal fun conversationListEmptyLabel(searchText: String): String =
    if (searchText.isEmpty()) {
        "No conversations yet"
    } else {
        "No results for \"$searchText\""
    }

internal fun podConversationListEmptyLabel(searchText: String): String =
    if (searchText.isEmpty()) {
        "No conversations yet"
    } else {
        "No matching conversations"
    }

internal fun capabilitySearchEmptyLabel(query: String): String =
    if (query.isEmpty()) {
        "No capabilities available"
    } else {
        "No results"
    }

@Composable
private fun WorkspaceTitlePicker(
    current: Workspace?,
    workspaces: List<Workspace>,
    enabled: Boolean,
    onSelect: (Workspace) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val canSwitchWorkspace = enabled && workspaces.size > 1
    val titleModifier = if (canSwitchWorkspace) {
        Modifier
            .clickable { expanded = true }
            .semantics { contentDescription = "Switch workspace" }
    } else {
        Modifier
    }
    Box {
        Surface(
            modifier = titleModifier,
            shape = RoundedCornerShape(15.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    current?.name ?: "Workspace",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (canSwitchWorkspace) {
                    Icon(
                        painter = painterResource(R.drawable.ic_expand_more_24),
                        contentDescription = null,
                        modifier = Modifier.size(12.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.widthIn(min = 220.dp, max = 280.dp),
            shape = RoundedCornerShape(8.dp),
            containerColor = MaterialTheme.colorScheme.background,
            tonalElevation = 0.dp,
            shadowElevation = 6.dp,
        ) {
            workspaces.forEach { workspace ->
                val isSelected = workspace.sId == current?.sId
                DropdownMenuItem(
                    text = {
                        Text(
                            workspace.name,
                            fontWeight = if (isSelected) {
                                FontWeight.SemiBold
                            } else {
                                null
                            },
                        )
                    },
                    trailingIcon = {
                        if (isSelected) {
                            Icon(
                                painter = painterResource(R.drawable.ic_check_24),
                                contentDescription = "Selected workspace",
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    },
                    onClick = {
                        expanded = false
                        onSelect(workspace)
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationRow(
    conversation: Conversation,
    onOpen: () -> Unit,
    showActions: Boolean = true,
    onToggleRead: () -> Unit,
    onDelete: () -> Unit,
) {
    if (!showActions) {
        ConversationRowContent(conversation = conversation, onOpen = onOpen)
        return
    }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onToggleRead()
                SwipeToDismissBoxValue.EndToStart -> onDelete()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            ConversationRowSwipeBackground(
                direction = dismissState.dismissDirection,
                markReadLabel = if (conversation.unread || conversation.actionRequired) {
                    "Mark read"
                } else {
                    "Mark unread"
                },
            )
        },
    ) {
        ConversationRowContent(conversation = conversation, onOpen = onOpen)
    }
}

@Composable
private fun ConversationRowContent(
    conversation: Conversation,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        val preview = conversation.preview
        DustAvatar(
            name = preview?.authorName ?: (conversation.title ?: "Dust"),
            avatarUrl = preview?.authorAvatarUrl,
            size = 32.dp,
            isAgent = preview?.isAgent == true,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ConversationStatusDot(conversation = conversation)
                Text(
                    conversation.title ?: "New conversation",
                    modifier = Modifier.weight(1f),
                    fontWeight = FontWeight.Medium,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            preview?.snippet?.takeIf { it.isNotBlank() }?.let { snippet ->
                Text(
                    snippet,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            preview?.replyCount?.let(::replyCountLabel)?.let { label ->
                Text(
                    label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationRowSwipeBackground(
    direction: SwipeToDismissBoxValue,
    markReadLabel: String,
) {
    if (direction == SwipeToDismissBoxValue.Settled) {
        return
    }

    val isDelete = direction == SwipeToDismissBoxValue.EndToStart
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                if (isDelete) {
                    MaterialTheme.colorScheme.errorContainer
                } else {
                    MaterialTheme.colorScheme.secondaryContainer
                },
            )
            .padding(horizontal = 24.dp),
        contentAlignment = if (isDelete) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Text(
            if (isDelete) "Delete" else markReadLabel,
            color = if (isDelete) {
                MaterialTheme.colorScheme.onErrorContainer
            } else {
                MaterialTheme.colorScheme.onSecondaryContainer
            },
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun ConversationStatusDot(
    conversation: Conversation,
    modifier: Modifier = Modifier,
) {
    val color = when {
        conversation.actionRequired -> Color(0xFFFFBE2C)
        conversation.unread -> MaterialTheme.colorScheme.secondary
        else -> return
    }
    Box(
        modifier = modifier
            .size(8.dp)
            .background(color, CircleShape),
    )
}

@Composable
private fun ComposerBar(
    text: String,
    onTextChange: (String) -> Unit,
    agents: List<LightAgentConfiguration>,
    selectedAgent: LightAgentConfiguration?,
    openAgentRequest: Boolean,
    onOpenAgentRequestConsumed: () -> Unit,
    onSelectAgent: (LightAgentConfiguration) -> Unit,
    attachments: List<AttachmentDraft>,
    onRemoveAttachment: (String) -> Unit,
    selectedCapabilities: List<Capability>,
    onRemoveCapability: (Capability) -> Unit,
    selectedKnowledgeItems: List<KnowledgeItem>,
    onRemoveKnowledgeItem: (KnowledgeItem) -> Unit,
    enabled: Boolean,
    canSend: Boolean,
    isSending: Boolean,
    error: String?,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onShowCapabilities: () -> Unit,
    onShowKnowledge: () -> Unit,
    onVoice: () -> Unit,
    onSend: () -> Unit,
    placeholder: String = "Ask anything or call an agent with @",
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shadowElevation = 0.dp,
    ) {
        Column {
            error?.takeIf { it.isNotBlank() }?.let { message ->
                Text(
                    message,
                    modifier = Modifier.padding(start = 16.dp, top = 10.dp, end = 16.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (
                attachments.isNotEmpty() ||
                selectedCapabilities.isNotEmpty() ||
                selectedKnowledgeItems.isNotEmpty()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    attachments.forEach { attachment ->
                        RemovableComposerChip(
                            label = attachment.fileName,
                            onRemove = { onRemoveAttachment(attachment.id) },
                        )
                    }
                    selectedCapabilities.forEach { capability ->
                        RemovableComposerChip(
                            label = capability.displayName,
                            accent = capability is Capability.SkillCapability,
                            onRemove = { onRemoveCapability(capability) },
                        )
                    }
                    selectedKnowledgeItems.forEach { item ->
                        RemovableComposerChip(
                            label = item.title,
                            onRemove = { onRemoveKnowledgeItem(item) },
                        )
                    }
                }
            }
            BasicTextField(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp, max = 144.dp)
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                value = text,
                onValueChange = onTextChange,
                enabled = enabled,
                minLines = 1,
                maxLines = 6,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = if (enabled) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                decorationBox = { innerTextField ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (text.isEmpty()) {
                            Text(
                                placeholder,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        innerTextField()
                    }
                },
            )
            Row(
                modifier = Modifier.padding(start = 8.dp, end = 8.dp, top = 2.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AgentSelector(
                    agents = agents,
                    selected = selectedAgent,
                    enabled = enabled,
                    openRequest = openAgentRequest,
                    onOpenRequestConsumed = onOpenAgentRequestConsumed,
                    onSelect = onSelectAgent,
                )
                ComposerToolbarButton(
                    enabled = enabled,
                    iconRes = R.drawable.ic_tune_24,
                    contentDescription = "Capabilities",
                    onClick = onShowCapabilities,
                )
                ComposerContextButton(
                    enabled = enabled,
                    onAddPhoto = onAddPhoto,
                    onAddFile = onAddFile,
                    onShowCapabilities = onShowCapabilities,
                    onShowKnowledge = onShowKnowledge,
                )
                Spacer(Modifier.weight(1f))
                ComposerActionButton(
                    canSend = canSend,
                    enabled = enabled,
                    isSending = isSending,
                    onVoice = onVoice,
                    onSend = onSend,
                )
            }
        }
    }
}

@Composable
private fun RemovableComposerChip(
    label: String,
    accent: Boolean = false,
    onRemove: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .height(32.dp)
            .clickable(onClick = onRemove),
        shape = RoundedCornerShape(10.dp),
        color = if (accent) {
            MaterialTheme.colorScheme.secondaryContainer
        } else {
            MaterialTheme.colorScheme.surface
        },
        contentColor = if (accent) {
            MaterialTheme.colorScheme.onSecondaryContainer
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, end = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelMedium,
            )
            Icon(
                painter = painterResource(R.drawable.ic_close_24),
                contentDescription = "Remove $label",
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

@Composable
private fun ComposerContextButton(
    enabled: Boolean,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onShowCapabilities: () -> Unit,
    onShowKnowledge: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        Surface(
            modifier = Modifier
                .size(36.dp)
                .clickable(enabled = enabled) { expanded = true },
            shape = RoundedCornerShape(12.dp),
            color = Color.Transparent,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    painter = painterResource(R.drawable.ic_attach_file_24),
                    contentDescription = "Add context",
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            shape = RoundedCornerShape(12.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
        ) {
            listOf(
                Triple("Photos", R.drawable.ic_image_24, onAddPhoto),
                Triple("Files", R.drawable.ic_attach_file_24, onAddFile),
                Triple("Capabilities", R.drawable.ic_tune_24, onShowCapabilities),
                Triple("Knowledge", R.drawable.ic_search_24, onShowKnowledge),
            ).forEach { (label, iconRes, action) ->
                DropdownMenuItem(
                    text = {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                painter = painterResource(iconRes),
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(label)
                        }
                    },
                    onClick = {
                        expanded = false
                        action()
                    },
                )
            }
        }
    }
}

@Composable
private fun ComposerToolbarButton(
    enabled: Boolean,
    iconRes: Int,
    contentDescription: String,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .size(36.dp)
            .clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = Color.Transparent,
        contentColor = if (enabled) {
            MaterialTheme.colorScheme.onSurfaceVariant
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
        },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun ComposerActionButton(
    canSend: Boolean,
    enabled: Boolean,
    isSending: Boolean,
    onVoice: () -> Unit,
    onSend: () -> Unit,
) {
    val isSend = canSend && enabled && !isSending
    val isEmphasized = isSend || isSending
    val actionDescription = when {
        isSending -> "Sending"
        isSend -> "Send"
        else -> "Voice input"
    }
    Surface(
        modifier = Modifier
            .size(36.dp)
            .semantics { contentDescription = actionDescription }
            .clickable(
                enabled = enabled && !isSending,
                onClick = if (isSend) onSend else onVoice,
            ),
        shape = RoundedCornerShape(12.dp),
        color = if (isEmphasized) {
            MaterialTheme.colorScheme.secondary
        } else {
            MaterialTheme.colorScheme.surface
        },
        contentColor = if (isEmphasized) {
            MaterialTheme.colorScheme.onSecondary
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = null,
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (isSending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = MaterialTheme.colorScheme.onSecondary,
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    painter = painterResource(
                        if (isSend) R.drawable.ic_arrow_up_24 else R.drawable.ic_mic_24,
                    ),
                    contentDescription = null,
                    modifier = Modifier.size(if (isSend) 16.dp else 18.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ComposeScreen(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    spaceId: String? = null,
    onCreated: (Conversation) -> Unit,
) {
    val composeViewModel: ComposeViewModel = viewModel(
        key = "compose-$workspaceId-${spaceId.orEmpty()}",
        factory = factory { ComposeViewModel(graph, tokenProvider, isLocalPreview, workspaceId, user, spaceId) },
    )
    val state by composeViewModel.state.collectAsStateWithLifecycle()
    val speechState by composeViewModel.speechState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val attachmentReadScope = rememberCoroutineScope()
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            composeViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        }
    }
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(PHOTO_PICKER_MAX_ITEMS),
    ) { uris ->
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            composeViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        }
    }
    val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            composeViewModel.startVoiceInput()
        } else {
            composeViewModel.denyVoiceInput()
        }
    }
    val startVoiceInput = {
        if (
            isLocalPreview ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        ) {
            composeViewModel.startVoiceInput()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    DisposableEffect(composeViewModel) {
        onDispose { composeViewModel.discardDraft() }
    }
    var showCapabilities by remember(workspaceId, spaceId) { mutableStateOf(false) }
    var showKnowledge by remember(workspaceId, spaceId) { mutableStateOf(false) }
    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .imePadding(),
        ) {
            Text(
                composeGreeting(user),
                modifier = Modifier.padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 4.dp),
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
            ComposerBar(
                text = state.text,
                onTextChange = composeViewModel::updateText,
                agents = state.agents,
                selectedAgent = state.selectedAgent,
                openAgentRequest = state.shouldOpenAgentPicker,
                onOpenAgentRequestConsumed = composeViewModel::dismissAgentPicker,
                onSelectAgent = composeViewModel::selectAgent,
                attachments = state.attachments,
                onRemoveAttachment = composeViewModel::removeAttachment,
                selectedCapabilities = state.selectedCapabilities,
                onRemoveCapability = composeViewModel::toggleCapability,
                selectedKnowledgeItems = state.selectedKnowledgeItems,
                onRemoveKnowledgeItem = composeViewModel::toggleKnowledgeItem,
                enabled = !state.isSending && !speechState.isBusy,
                canSend = state.canSend,
                isSending = state.isSending,
                error = state.error,
                onAddPhoto = {
                    photoPicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                onAddFile = { filePicker.launch(SUPPORTED_UPLOAD_MIME_TYPES.toTypedArray()) },
                onShowCapabilities = { showCapabilities = true },
                onShowKnowledge = { showKnowledge = true },
                onVoice = startVoiceInput,
                onSend = { composeViewModel.send(onCreated) },
            )
            if (state.agents.isNotEmpty()) {
                Text(
                    "Agents",
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 8.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(
                        count = state.agents.size,
                        key = { index -> "browser-${state.agents[index].sId}" },
                    ) { index ->
                        val agent = state.agents[index]
                        AgentBrowserCard(
                            agent = agent,
                            selected = state.selectedAgent?.sId == agent.sId,
                            onSelect = { composeViewModel.selectAgent(agent) },
                        )
                    }
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
        }
        if (speechState.isPresented) {
            VoiceInputScreen(
                state = speechState,
                text = state.text,
                canSend = state.canSend,
                onStart = startVoiceInput,
                onStop = composeViewModel::stopVoiceInput,
                onExit = composeViewModel::cancelVoiceInput,
                onSend = {
                    composeViewModel.cancelVoiceInput()
                    composeViewModel.send(onCreated)
                },
            )
        }
    }
    if (showCapabilities) {
        ModalBottomSheet(
            onDismissRequest = { showCapabilities = false },
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
            tonalElevation = 0.dp,
        ) {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                CapabilitySelector(
                    capabilities = state.availableCapabilities,
                    selected = state.selectedCapabilities,
                    onToggle = { capability ->
                        composeViewModel.toggleCapability(capability)
                        showCapabilities = false
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
    if (showKnowledge) {
        ModalBottomSheet(
            onDismissRequest = { showKnowledge = false },
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
            tonalElevation = 0.dp,
        ) {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                KnowledgeSelector(
                    query = state.knowledgeQuery,
                    results = state.knowledgeResults,
                    selected = state.selectedKnowledgeItems,
                    isSearching = state.isSearchingKnowledge,
                    onQueryChange = composeViewModel::updateKnowledgeQuery,
                    onToggle = { item ->
                        composeViewModel.toggleKnowledgeItem(item)
                        showKnowledge = false
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

private fun composeGreeting(user: User): String =
    user.firstName?.trim()?.takeIf { it.isNotEmpty() }?.let { firstName ->
        "Good to see you, $firstName!"
    } ?: "Good to see you!"

@Composable
private fun AgentBrowserCard(
    agent: LightAgentConfiguration,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val borderColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.secondary.copy(alpha = 0.7f)
        } else {
            Color.Transparent
        },
        animationSpec = tween(durationMillis = 150),
        label = "agent-card-border",
    )
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 124.dp)
            .clickable(onClick = onSelect),
        shape = shape,
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(2.dp, borderColor),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DustAvatar(
                    name = agent.name,
                    avatarUrl = agent.pictureUrl,
                    size = 36.dp,
                    isAgent = true,
                )
                Text(
                    agent.name,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            agent.description.takeIf { it.isNotBlank() }?.let { description ->
                Text(
                    description,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DraftSectionLabel(label: String) {
    Text(
        label,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun SelectableTag(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    accentColor: Color = MaterialTheme.colorScheme.primary,
) {
    val containerColor = if (selected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    Surface(
        modifier = Modifier
            .height(34.dp)
            .clip(RoundedCornerShape(4.dp))
            .clickable(onClick = onClick),
        color = containerColor,
        contentColor = if (selected) {
            MaterialTheme.colorScheme.onPrimaryContainer
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        shape = RoundedCornerShape(4.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(width = 3.dp, height = 14.dp)
                    .background(
                        if (selected) accentColor else MaterialTheme.colorScheme.outline,
                        RoundedCornerShape(1.dp),
                    ),
            )
            Text(
                label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun ComposeQuickStarts(
    prompts: List<String> = COMPOSE_QUICK_STARTS,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        DraftSectionLabel("Quick starts")
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            prompts.forEach { prompt ->
                Surface(
                    modifier = Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .clickable { onSelect(prompt) },
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    shape = RoundedCornerShape(4.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 11.dp),
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier
                                .size(width = 3.dp, height = 14.dp)
                                .background(MaterialTheme.colorScheme.secondary, RoundedCornerShape(1.dp)),
                        )
                        Text(
                            prompt,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VoiceInputScreen(
    state: SpeechInputState,
    text: String,
    canSend: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onExit: () -> Unit,
    onSend: () -> Unit,
) {
    val transcriptScroll = rememberScrollState()
    LaunchedEffect(text) {
        withFrameNanos { }
        transcriptScroll.animateScrollTo(transcriptScroll.maxValue)
    }
    val status = when {
        state.error != null -> state.error
        state.isConnecting -> "Connecting..."
        state.isFinalizing -> "Finishing up..."
        state.isRecording -> "Listening..."
        text.isBlank() -> "Tap to speak"
        else -> "Paused - send or keep recording"
    }

    Dialog(
        onDismissRequest = { if (!state.isBusy) onExit() },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        val dialogView = LocalView.current
        val dialogBackground = MaterialTheme.colorScheme.background
        SideEffect {
            (dialogView.parent as? DialogWindowProvider)?.window?.let { window ->
                window.statusBarColor = dialogBackground.toArgb()
                window.navigationBarColor = dialogBackground.toArgb()
                WindowCompat.getInsetsController(window, dialogView).apply {
                    val useDarkIcons = dialogBackground.luminance() > 0.5f
                    isAppearanceLightStatusBars = useDarkIcons
                    isAppearanceLightNavigationBars = useDarkIcons
                }
            }
        }
        Box(
            modifier = Modifier.fillMaxSize(),
        ) {
            VoiceFloodBackground(
                level = state.audioLevel,
                active = state.isRecording,
            )
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .systemBarsPadding()
                    .padding(horizontal = 28.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .heightIn(max = 220.dp)
                        .fillMaxWidth()
                        .verticalScroll(transcriptScroll),
                    contentAlignment = Alignment.TopStart,
                ) {
                    Text(
                        text = text,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Normal,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.weight(1f))
                VoicePulse(level = state.audioLevel, active = state.isRecording)
                Spacer(Modifier.weight(1f))
                Text(
                    text = status.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (state.error == null) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(36.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    VoiceControlButton(
                        enabled = !state.isBusy,
                        iconRes = R.drawable.ic_expand_more_24,
                        contentDescription = "Exit voice input",
                        size = 58.dp,
                        onClick = onExit,
                    )
                    Surface(
                        modifier = Modifier.size(78.dp),
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                        shadowElevation = 10.dp,
                    ) {
                        IconButton(
                            modifier = Modifier.semantics {
                                contentDescription = if (state.isRecording) {
                                    "Stop recording"
                                } else {
                                    "Start recording"
                                }
                            },
                            enabled = !state.isConnecting && !state.isFinalizing,
                            onClick = if (state.isRecording) onStop else onStart,
                        ) {
                            if (state.isRecording) {
                                Box(
                                    Modifier
                                        .size(26.dp)
                                        .background(MaterialTheme.colorScheme.onSecondary, RoundedCornerShape(6.dp)),
                                )
                            } else {
                                Icon(
                                    painter = painterResource(R.drawable.ic_mic_24),
                                    contentDescription = null,
                                    modifier = Modifier.size(30.dp),
                                )
                            }
                        }
                    }
                    VoiceControlButton(
                        enabled = !state.isBusy && canSend,
                        iconRes = R.drawable.ic_arrow_up_24,
                        contentDescription = "Send message",
                        emphasized = true,
                        size = 58.dp,
                        onClick = onSend,
                    )
                }
                Spacer(Modifier.height(28.dp))
            }
        }
    }
}

@Composable
private fun VoiceFloodBackground(level: Float, active: Boolean) {
    val amplitude by animateFloatAsState(
        targetValue = if (active) level.coerceIn(0f, 1f) else 0f,
        animationSpec = tween(durationMillis = 250, easing = FastOutSlowInEasing),
        label = "voice-flood-amplitude",
    )
    val background = MaterialTheme.colorScheme.background
    val blue = MaterialTheme.colorScheme.secondary
    val paleBlue = MaterialTheme.colorScheme.secondaryContainer
    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .background(background),
    ) {
        val baseRadius = size.width * (0.48f + amplitude * 0.2f)
        listOf(
            Triple(Offset(size.width * 0.2f, size.height * 0.28f), baseRadius, paleBlue),
            Triple(Offset(size.width * 0.82f, size.height * 0.42f), baseRadius * 1.08f, paleBlue),
            Triple(Offset(size.width * 0.5f, size.height * 0.8f), baseRadius * 1.16f, blue),
        ).forEach { (center, radius, color) ->
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        color.copy(alpha = 0.24f + amplitude * 0.2f),
                        Color.Transparent,
                    ),
                    center = center,
                    radius = radius,
                ),
                radius = radius,
                center = center,
            )
        }
    }
}

@Composable
private fun VoicePulse(level: Float, active: Boolean) {
    val amplitude by animateFloatAsState(
        targetValue = if (active) level.coerceIn(0f, 1f) else 0f,
        animationSpec = tween(durationMillis = 200, easing = FastOutSlowInEasing),
        label = "voice-pulse-amplitude",
    )
    Box(
        modifier = Modifier.size(220.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (active) {
            repeat(3) { index ->
                Box(
                    modifier = Modifier
                        .size((150 + index * 28).dp)
                        .border(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.2f - index * 0.04f),
                            shape = CircleShape,
                        )
                        .graphicsLayer {
                            val scale = 1f + amplitude * (0.18f + index * 0.04f)
                            scaleX = scale
                            scaleY = scale
                        },
                )
            }
        }
        Box(
            modifier = Modifier
                .size(120.dp)
                .graphicsLayer {
                    val scale = 1f + amplitude * 0.5f
                    scaleX = scale
                    scaleY = scale
                }
                .background(MaterialTheme.colorScheme.secondary, CircleShape),
        )
    }
}

@Composable
private fun VoiceControlButton(
    enabled: Boolean,
    iconRes: Int,
    contentDescription: String,
    emphasized: Boolean = false,
    size: Dp = 52.dp,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.size(size),
        shape = CircleShape,
        color = when {
            !enabled -> MaterialTheme.colorScheme.surfaceVariant
            emphasized -> MaterialTheme.colorScheme.secondary
            else -> MaterialTheme.colorScheme.primaryContainer
        },
        contentColor = when {
            !enabled -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
            emphasized -> MaterialTheme.colorScheme.onSecondary
            else -> MaterialTheme.colorScheme.onSurface
        },
    ) {
        IconButton(enabled = enabled, onClick = onClick) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationDetailScreen(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    conversation: Conversation,
    currentUserSId: String?,
    onOpenInBrowser: (() -> Unit)?,
    onTitleChanged: (String) -> Unit,
    onMarkedAsRead: () -> Unit,
    onOpenContentFragment: (ContentFragment) -> Unit,
    onOpenFile: (GeneratedFile) -> Unit,
) {
    val detailViewModel: ConversationDetailViewModel = viewModel(
        key = "detail-${conversation.sId}",
        factory = factory {
            ConversationDetailViewModel(
                graph,
                tokenProvider,
                isLocalPreview,
                workspaceId,
                conversation,
                user,
                currentUserSId,
            )
        },
    )
    val state by detailViewModel.state.collectAsStateWithLifecycle()
    val speechState by detailViewModel.speechState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val hiddenAgentHeaderIds = remember(state.messages) {
        steeredAgentHeaderMessageIds(state.messages)
    }
    val messageListState = rememberLazyListState()
    val context = LocalContext.current
    val attachmentReadScope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            detailViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        }
    }
    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(PHOTO_PICKER_MAX_ITEMS),
    ) { uris ->
        attachmentReadScope.addPickedFiles(context, uris) { file ->
            detailViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        }
    }
    val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            detailViewModel.startVoiceInput()
        } else {
            detailViewModel.denyVoiceInput()
        }
    }
    val startVoiceInput = {
        if (
            isLocalPreview ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        ) {
            detailViewModel.startVoiceInput()
        } else {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    var showReplyCapabilitiesSelector by remember(conversation.sId) { mutableStateOf(false) }
    var showReplyKnowledgeSelector by remember(conversation.sId) { mutableStateOf(false) }

    LaunchedEffect(conversation.sId) {
        detailViewModel.load()
    }
    LaunchedEffect(state.conversationTitle) {
        val title = state.conversationTitle ?: return@LaunchedEffect
        onTitleChanged(title)
    }
    LaunchedEffect(state.isLoading, state.error, conversation.sId) {
        if (!state.isLoading && state.error == null && shouldMarkConversationAsReadOnOpen(conversation)) {
            onMarkedAsRead()
        }
    }
    LaunchedEffect(state.messages.lastOrNull()?.id) {
        if (state.messages.isNotEmpty()) {
            withFrameNanos { }
            val bottomAnchorIndex = state.messages.size + if (state.hasMore) 1 else 0
            messageListState.animateScrollToItem(bottomAnchorIndex)
        }
    }
    DisposableEffect(lifecycleOwner, conversation.sId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                detailViewModel.resyncOnForeground()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            detailViewModel.cancelAttachmentUploads()
            detailViewModel.cancelVoiceInput()
        }
    }
    val hasInlineBlockedState = remember(state.messages, state.streamingMessageId, state.blockedState) {
        state.messages.any { message ->
            inlineBlockedStateForMessage(message, state.streamingMessageId, state.blockedState) != null
        }
    }
    val isInitialLoading = state.isLoading && state.messages.isEmpty()
    val hasInitialError = state.error != null && state.messages.isEmpty()

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .imePadding(),
        ) {
            when {
                isInitialLoading -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                hasInitialError -> Box(Modifier.weight(1f)) {
                    ErrorScreen(
                        message = state.error ?: "Failed to load conversation",
                        onRetry = detailViewModel::load,
                    )
                }
                else -> LazyColumn(
                    state = messageListState,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    contentPadding = PaddingValues(top = 16.dp, bottom = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (state.hasMore) {
                        item {
                            TextButton(
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !state.isLoadingMore,
                                onClick = detailViewModel::loadMore,
                            ) {
                                Text(if (state.isLoadingMore) "Loading..." else "Load older messages")
                            }
                        }
                    }
                    items(state.messages, key = { it.id }) { message ->
                        val isStreamingMessage = message.id == state.streamingMessageId
                        val inlineBlockedState = inlineBlockedStateForMessage(
                            message = message,
                            streamingMessageId = state.streamingMessageId,
                            blockedState = state.blockedState,
                        )
                        MessageBubble(
                            message = message,
                            currentUserEmail = user.email,
                            currentUserSId = currentUserSId,
                            lastError = state.lastError?.takeIf { it.messageId == message.id },
                            hideAgentHeader = message.id in hiddenAgentHeaderIds,
                            streamingActivity = state.streamingActivity.takeIf { isStreamingMessage },
                            activeActions = if (isStreamingMessage) state.activeActions else emptyList(),
                            completedSteps = if (isStreamingMessage) state.completedSteps else emptyList(),
                            blockedState = inlineBlockedState,
                            isValidatingAction = state.isValidatingAction,
                            actionError = state.actionError.takeIf { inlineBlockedState != null },
                            onOpenContentFragment = onOpenContentFragment,
                            loadContentFragmentImage = detailViewModel::loadContentFragmentImage,
                            onOpenGeneratedFile = onOpenFile,
                            onOpenCitation = { citation ->
                                citation.href?.let(uriHandler::openUri)
                            },
                            onRetryMessage = detailViewModel::retryMessage,
                            onValidateAction = detailViewModel::validateAction,
                            onAnswerQuestion = detailViewModel::answerQuestion,
                            onOpenInBrowser = onOpenInBrowser,
                        )
                    }
                    item(key = "conversation-bottom-anchor") {
                        Spacer(Modifier.height(1.dp))
                    }
                }
            }
            if (!isInitialLoading && !hasInitialError) {
                BlockedActionCard(
                    blockedState = state.blockedState.takeUnless { hasInlineBlockedState },
                    isLoading = state.isValidatingAction,
                    error = state.actionError.takeUnless { hasInlineBlockedState },
                    onValidate = detailViewModel::validateAction,
                    onAnswer = detailViewModel::answerQuestion,
                    onOpenInBrowser = onOpenInBrowser,
                    currentUserSId = currentUserSId,
                )
                ComposerBar(
                    text = state.replyText,
                    onTextChange = detailViewModel::updateReply,
                    agents = state.agents,
                    selectedAgent = state.selectedReplyAgent,
                    openAgentRequest = state.shouldOpenAgentPicker,
                    onOpenAgentRequestConsumed = detailViewModel::dismissReplyAgentPicker,
                    onSelectAgent = detailViewModel::selectReplyAgent,
                    attachments = state.attachments,
                    onRemoveAttachment = detailViewModel::removeAttachment,
                    selectedCapabilities = state.selectedCapabilities,
                    onRemoveCapability = detailViewModel::toggleReplyCapability,
                    selectedKnowledgeItems = state.selectedKnowledgeItems,
                    onRemoveKnowledgeItem = detailViewModel::toggleReplyKnowledgeItem,
                    enabled = !speechState.isBusy && !state.isSending,
                    canSend = state.canSendReply,
                    isSending = state.isSending,
                    error = state.error?.takeIf { state.messages.isNotEmpty() },
                    onAddPhoto = {
                        photoPicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    onAddFile = { filePicker.launch(SUPPORTED_UPLOAD_MIME_TYPES.toTypedArray()) },
                    onShowCapabilities = { showReplyCapabilitiesSelector = true },
                    onShowKnowledge = { showReplyKnowledgeSelector = true },
                    onVoice = startVoiceInput,
                    onSend = detailViewModel::sendReply,
                )
            }
        }
        if (speechState.isPresented) {
            VoiceInputScreen(
                state = speechState,
                text = state.replyText,
                canSend = state.canSendReply,
                onStart = startVoiceInput,
                onStop = detailViewModel::stopVoiceInput,
                onExit = detailViewModel::cancelVoiceInput,
                onSend = {
                    detailViewModel.cancelVoiceInput()
                    detailViewModel.sendReply()
                },
            )
        }
    }
    if (showReplyCapabilitiesSelector) {
        ModalBottomSheet(
            onDismissRequest = { showReplyCapabilitiesSelector = false },
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
            tonalElevation = 0.dp,
        ) {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                CapabilitySelector(
                    capabilities = state.availableCapabilities,
                    selected = state.selectedCapabilities,
                    onToggle = { capability ->
                        detailViewModel.toggleReplyCapability(capability)
                        showReplyCapabilitiesSelector = false
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
    if (showReplyKnowledgeSelector) {
        ModalBottomSheet(
            onDismissRequest = { showReplyKnowledgeSelector = false },
            containerColor = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
            tonalElevation = 0.dp,
        ) {
            Box(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
                KnowledgeSelector(
                    query = state.knowledgeQuery,
                    results = state.knowledgeResults,
                    selected = state.selectedKnowledgeItems,
                    isSearching = state.isSearchingKnowledge,
                    onQueryChange = detailViewModel::updateReplyKnowledgeQuery,
                    onToggle = { item ->
                        detailViewModel.toggleReplyKnowledgeItem(item)
                        showReplyKnowledgeSelector = false
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ReplyIconActionButton(
    enabled: Boolean,
    onClick: () -> Unit,
    iconRes: Int,
    contentDescription: String,
    selected: Boolean = false,
) {
    val contentColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
        selected -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        modifier = Modifier
            .size(40.dp),
        shape = RoundedCornerShape(4.dp),
        color = if (selected) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            Color.Transparent
        },
        contentColor = contentColor,
    ) {
        IconButton(
            modifier = Modifier.fillMaxSize(),
            enabled = enabled,
            onClick = onClick,
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(20.dp),
                tint = contentColor,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgentSelector(
    agents: List<LightAgentConfiguration>,
    selected: LightAgentConfiguration?,
    enabled: Boolean = true,
    openRequest: Boolean = false,
    onOpenRequestConsumed: () -> Unit = {},
    onSelect: (LightAgentConfiguration) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val filteredAgents = remember(agents, query) { filterAgents(agents, query) }
    LaunchedEffect(openRequest, agents.size, enabled) {
        if (openRequest && enabled && agents.isNotEmpty()) {
            expanded = true
            onOpenRequestConsumed()
        }
    }
    Box {
        Surface(
            modifier = Modifier
                .height(36.dp)
                .widthIn(max = 132.dp)
                .clip(RoundedCornerShape(10.dp))
                .clickable(enabled = enabled && agents.isNotEmpty()) { expanded = true },
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                selected?.let { agent ->
                    DustAvatar(name = agent.name, avatarUrl = agent.pictureUrl, size = 20.dp, isAgent = true)
                } ?: Icon(
                    painter = painterResource(R.drawable.ic_robot_24),
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                )
                Text(
                    selected?.name ?: "Agent",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                )
                Icon(
                    painter = painterResource(R.drawable.ic_expand_more_24),
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (expanded) {
            ModalBottomSheet(
                onDismissRequest = {
                    expanded = false
                    query = ""
                    onOpenRequestConsumed()
                },
                containerColor = MaterialTheme.colorScheme.background,
                contentColor = MaterialTheme.colorScheme.onBackground,
                tonalElevation = 0.dp,
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Select an agent", style = MaterialTheme.typography.titleMedium)
                    PickerSearchField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = "Search agents",
                    )
                    if (filteredAgents.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "No agents",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        LazyColumn(modifier = Modifier.heightIn(min = 240.dp, max = 520.dp)) {
                            items(filteredAgents, key = { it.sId }) { agent ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            expanded = false
                                            query = ""
                                            onSelect(agent)
                                        }
                                        .padding(vertical = 10.dp),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    DustAvatar(name = agent.name, avatarUrl = agent.pictureUrl, size = 36.dp, isAgent = true)
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Text(agent.name, style = MaterialTheme.typography.labelLarge)
                                            agent.favoriteLabel()?.let { label ->
                                                Text(
                                                    label,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = MaterialTheme.colorScheme.secondary,
                                                )
                                            }
                                        }
                                        if (agent.description.isNotBlank()) {
                                            Text(
                                                agent.description,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                    }
                                    if (agent.sId == selected?.sId) {
                                        Icon(
                                            painter = painterResource(R.drawable.ic_check_24),
                                            contentDescription = "Selected agent",
                                            modifier = Modifier.size(18.dp),
                                            tint = MaterialTheme.colorScheme.secondary,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
private fun AttachmentSection(
    attachments: List<AttachmentDraft>,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Attachments", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ToolbarIconButton(
                    onClick = onAddPhoto,
                    iconRes = R.drawable.ic_image_24,
                    contentDescription = "Add photos",
                )
                ToolbarIconButton(
                    onClick = onAddFile,
                    iconRes = R.drawable.ic_attach_file_24,
                    contentDescription = "Add files",
                )
            }
        }
        AttachmentList(attachments = attachments, onRemove = onRemove)
    }
}

private fun CoroutineScope.addPickedFiles(
    context: Context,
    uris: List<Uri>,
    onFile: (PickedFile) -> Unit,
) {
    if (uris.isEmpty()) return
    launch {
        val files = withContext(Dispatchers.IO) {
            uris.mapNotNull { uri -> readPickedFile(context, uri) }
        }
        files.forEach(onFile)
    }
}

@Composable
private fun AttachmentList(
    attachments: List<AttachmentDraft>,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (attachments.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        attachments.forEach { attachment ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val stateText = when (val uploadState = attachment.uploadState) {
                    AttachmentUploadState.Pending -> "${attachment.fileSize / 1024} KB"
                    AttachmentUploadState.Uploading -> "Uploading"
                    is AttachmentUploadState.Uploaded -> "Uploaded"
                    is AttachmentUploadState.Failed -> uploadState.message
                }
                AttachmentThumbnail(attachment = attachment)
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    val typeLabel = iconLabelForContentType(attachment.contentType)
                    Text(
                        "$typeLabel · ${attachment.fileName} · $stateText",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                TextButton(onClick = { onRemove(attachment.id) }) {
                    Text("Remove")
                }
            }
        }
    }
}

@Composable
private fun AttachmentThumbnail(attachment: AttachmentDraft) {
    val previewData = attachment.thumbnailSourceData
    val bitmap = remember(attachment.id, previewData, attachment.contentType) {
        if (isImageContentType(attachment.contentType) && previewData != null) {
            BitmapFactory.decodeByteArray(previewData, 0, previewData.size)
        } else {
            null
        }
    }
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = attachment.fileName,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(
                iconLabelForContentType(attachment.contentType),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        when (attachment.uploadState) {
            AttachmentUploadState.Uploading -> CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
            )
            is AttachmentUploadState.Failed -> Text(
                "!",
                color = MaterialTheme.colorScheme.error,
                fontWeight = FontWeight.SemiBold,
            )
            AttachmentUploadState.Pending,
            is AttachmentUploadState.Uploaded,
            -> Unit
        }
    }
}

@Composable
private fun SelectedCapabilityList(
    selected: List<Capability>,
    onToggle: (Capability) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (selected.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        selected.forEach { capability ->
            SelectableTag(
                label = capability.displayName,
                selected = true,
                onClick = { onToggle(capability) },
            )
        }
    }
}

@Composable
private fun SelectedKnowledgeList(
    selected: List<KnowledgeItem>,
    onToggle: (KnowledgeItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (selected.isEmpty()) return
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        selected.forEach { item ->
            SelectableTag(
                label = item.title,
                selected = true,
                onClick = { onToggle(item) },
            )
        }
    }
}

@Composable
private fun CapabilityMenu(
    capabilities: List<Capability>,
    selected: List<Capability>,
    enabled: Boolean,
    onToggle: (Capability) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val selectableCapabilities = remember(capabilities, selected, query) {
        filterSelectableCapabilities(capabilities = capabilities, selected = selected, query = query, limit = 24)
    }
    Box {
        ReplyIconActionButton(
            enabled = enabled && capabilities.isNotEmpty(),
            onClick = { expanded = true },
            iconRes = R.drawable.ic_tune_24,
            contentDescription = "Tools and skills",
            selected = selected.isNotEmpty(),
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            OutlinedTextField(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { SearchFieldLeadingIcon() },
                label = { Text("Search tools and skills") },
            )
            if (selectableCapabilities.isEmpty()) {
                DropdownMenuItem(
                    text = {
                        Text(capabilitySearchEmptyLabel(query))
                    },
                    enabled = false,
                    onClick = {},
                )
            }
            selectableCapabilities.forEach { capability ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(
                                capability.displayName,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (capability.displayDescription.isNotBlank()) {
                                Text(
                                    capability.displayDescription,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    },
                    onClick = {
                        expanded = false
                        query = ""
                        onToggle(capability)
                    },
                )
            }
        }
    }
}

@Composable
private fun CapabilitySelector(
    capabilities: List<Capability>,
    selected: List<Capability>,
    onToggle: (Capability) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val selectableCapabilities = remember(capabilities, selected, query) {
        filterSelectableCapabilities(capabilities = capabilities, selected = selected, query = query, limit = 24)
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Capabilities", style = MaterialTheme.typography.titleMedium)
        PickerSearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = "Search capabilities",
        )
        if (selectableCapabilities.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    capabilitySearchEmptyLabel(query),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.heightIn(min = 240.dp, max = 520.dp),
            ) {
                items(selectableCapabilities, key = { it.id }) { capability ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggle(capability) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val isSkill = capability is Capability.SkillCapability
                        Surface(
                            modifier = Modifier.size(32.dp),
                            shape = RoundedCornerShape(8.dp),
                            color = if (isSkill) {
                                MaterialTheme.colorScheme.secondaryContainer
                            } else {
                                Color.Transparent
                            },
                            contentColor = if (isSkill) {
                                MaterialTheme.colorScheme.secondary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    painter = painterResource(
                                        if (isSkill) R.drawable.ic_robot_24 else R.drawable.ic_tune_24,
                                    ),
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                capability.displayName,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            if (capability.displayDescription.isNotBlank()) {
                                Text(
                                    capability.displayDescription,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KnowledgeSelector(
    query: String,
    results: List<KnowledgeItem>,
    selected: List<KnowledgeItem>,
    isSearching: Boolean,
    onQueryChange: (String) -> Unit,
    onToggle: (KnowledgeItem) -> Unit,
) {
    val selectableResults = remember(results, selected) {
        selectableKnowledgeItems(results, selected)
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Knowledge", style = MaterialTheme.typography.titleMedium)
        PickerSearchField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = if (isSearching) "Searching..." else "Search documents...",
        )
        when {
            query.length < 2 -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Search for documents and tables",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            isSearching && selectableResults.isEmpty() -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
            }
            selectableResults.isEmpty() -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "No results found",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> LazyColumn(
                modifier = Modifier.heightIn(min = 240.dp, max = 520.dp),
            ) {
                items(selectableResults.take(24), key = { it.id }) { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggle(item) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_attach_file_24),
                            contentDescription = null,
                            modifier = Modifier.size(22.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                item.title,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            listOfNotNull(item.connectorProvider, item.nodeType)
                                .joinToString(" · ")
                                .takeIf { it.isNotBlank() }
                                ?.let { subtitle ->
                                    Text(
                                        subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PickerSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
) {
    OutlinedTextField(
        modifier = Modifier.fillMaxWidth(),
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        leadingIcon = { SearchFieldLeadingIcon() },
        trailingIcon = if (value.isNotEmpty()) {
            {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(
                        painter = painterResource(R.drawable.ic_close_24),
                        contentDescription = "Clear search",
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        } else {
            null
        },
        placeholder = { Text(placeholder) },
        shape = RoundedCornerShape(15.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            focusedBorderColor = MaterialTheme.colorScheme.secondary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        ),
    )
}

@Composable
private fun MessageBubble(
    message: ConversationMessage,
    currentUserEmail: String,
    currentUserSId: String? = null,
    lastError: ErrorInfo? = null,
    hideAgentHeader: Boolean = false,
    streamingActivity: AgentMessageStream.Activity? = null,
    activeActions: List<ActiveAction> = emptyList(),
    completedSteps: List<ActivityStep> = emptyList(),
    blockedState: BlockedState? = null,
    isValidatingAction: Boolean = false,
    actionError: String? = null,
    onOpenContentFragment: ((ContentFragment) -> Unit)? = null,
    loadContentFragmentImage: (suspend (String) -> ByteArray?)? = null,
    onOpenGeneratedFile: ((GeneratedFile) -> Unit)? = null,
    onOpenCitation: ((CitationReference) -> Unit)? = null,
    onRetryMessage: (String) -> Unit = {},
    onValidateAction: (ActionApproval) -> Unit = {},
    onAnswerQuestion: (UserQuestionAnswer) -> Unit = {},
    onOpenInBrowser: (() -> Unit)? = null,
) {
    Column(Modifier.fillMaxWidth()) {
        when (message) {
            is ConversationMessage.User -> UserMessageContent(
                message = message.message,
                isCurrentUser = isCurrentUserMessage(message.message, currentUserEmail),
                onOpenContentFragment = onOpenContentFragment,
                loadContentFragmentImage = loadContentFragmentImage,
            )
            is ConversationMessage.Agent -> AgentMessageContent(
                message = message.message,
                lastError = lastError,
                hideHeader = hideAgentHeader,
                streamingActivity = streamingActivity,
                activeActions = activeActions,
                completedSteps = completedSteps,
                blockedState = blockedState,
                isValidatingAction = isValidatingAction,
                actionError = actionError,
                onOpenGeneratedFile = onOpenGeneratedFile,
                onOpenCitation = onOpenCitation,
                onRetryMessage = onRetryMessage,
                onValidateAction = onValidateAction,
                onAnswerQuestion = onAnswerQuestion,
                onOpenInBrowser = onOpenInBrowser,
                currentUserSId = currentUserSId,
            )
        }
    }
}

@Composable
private fun UserMessageContent(
    message: com.dust.mobile.core.model.UserMessage,
    isCurrentUser: Boolean,
    onOpenContentFragment: ((ContentFragment) -> Unit)?,
    loadContentFragmentImage: (suspend (String) -> ByteArray?)?,
) {
    val timestamp = remember(message.created) { formatMessageTimestamp(message.created) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (message.isPending) 0.5f else 1f),
        horizontalAlignment = if (isCurrentUser) Alignment.End else Alignment.Start,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (isCurrentUser) {
            MessageTimestamp(timestamp)
        } else {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DustAvatar(
                    name = message.authorName,
                    avatarUrl = message.authorAvatarUrl,
                    size = 28.dp,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        message.authorName ?: "User",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    MessageTimestamp(timestamp)
                }
            }
        }
        ContentFragmentChips(
            fragments = message.contentFragments.orEmpty(),
            onOpen = onOpenContentFragment,
            loadImage = loadContentFragmentImage,
        )
        if (message.content.isNotBlank()) {
            if (isCurrentUser) {
                DustMarkdownText(
                    message.content,
                    modifier = Modifier
                        .widthIn(max = 320.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                )
            } else {
                DustMarkdownText(message.content, selectable = true)
            }
        }
    }
}

@Composable
private fun MessageTimestamp(timestamp: String) {
    if (timestamp.isNotEmpty()) {
        Text(
            timestamp,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Normal,
        )
    }
}

internal fun formatMessageTimestamp(
    created: Double,
    zoneId: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): String {
    if (!created.isFinite() || created <= 0) return ""
    val epochMillis = if (created < 100_000_000_000) created * 1_000 else created
    return runCatching {
        DateTimeFormatter
            .ofLocalizedTime(FormatStyle.SHORT)
            .withLocale(locale)
            .withZone(zoneId)
            .format(Instant.ofEpochMilli(epochMillis.toLong()))
    }.getOrDefault("")
}

@Composable
private fun DustMarkdownText(
    content: String,
    modifier: Modifier = Modifier,
    selectable: Boolean = false,
) {
    val document = remember(content) { renderMessageMarkdown(content) }
    if (selectable) {
        SelectionContainer {
            DustMarkdownDocument(document = document, modifier = modifier)
        }
    } else {
        DustMarkdownDocument(document = document, modifier = modifier)
    }
}

@Composable
private fun DustMarkdownDocument(
    document: RenderedMarkdownDocument,
    modifier: Modifier = Modifier,
) {
    if (document.blocks.isEmpty()) {
        return
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        document.blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Paragraph -> DustInlineText(
                    inlines = block.inlines,
                    style = MaterialTheme.typography.bodyLarge,
                )
                is MarkdownBlock.Heading -> DustInlineText(
                    inlines = block.inlines,
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.titleLarge
                        2 -> MaterialTheme.typography.titleMedium
                        else -> MaterialTheme.typography.titleSmall
                    },
                    fontWeight = FontWeight.SemiBold,
                )
                is MarkdownBlock.Quote -> Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 3.dp, height = 24.dp)
                            .background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(2.dp)),
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is MarkdownBlock.ListItem -> Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        block.number?.let { "$it." } ?: "•",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                is MarkdownBlock.TaskListItem -> Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Checkbox(
                        checked = block.checked,
                        onCheckedChange = null,
                        enabled = false,
                        modifier = Modifier.size(24.dp),
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                is MarkdownBlock.Table -> DustMarkdownTable(block)
                is MarkdownBlock.CodeBlock -> Text(
                    block.code,
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
                MarkdownBlock.Divider -> HorizontalDivider()
            }
        }
    }
}

@Composable
private fun DustMarkdownTable(table: MarkdownBlock.Table) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        DustMarkdownTableRow(cells = table.headers, isHeader = true)
        table.rows.forEach { row ->
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            DustMarkdownTableRow(cells = row, isHeader = false)
        }
    }
}

@Composable
private fun DustMarkdownTableRow(cells: List<MarkdownTableCell>, isHeader: Boolean) {
    Row {
        cells.forEach { cell ->
            DustInlineText(
                inlines = cell.inlines,
                modifier = Modifier
                    .widthIn(min = 112.dp)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                style = if (isHeader) {
                    MaterialTheme.typography.labelMedium
                } else {
                    MaterialTheme.typography.bodyMedium
                },
                fontWeight = if (isHeader) FontWeight.SemiBold else null,
            )
        }
    }
}

@Composable
private fun DustInlineText(
    inlines: List<MarkdownInline>,
    modifier: Modifier = Modifier,
    style: TextStyle,
    color: Color = MaterialTheme.colorScheme.onSurface,
    fontWeight: FontWeight? = null,
) {
    val linkColor = MaterialTheme.colorScheme.secondary
    val codeBackgroundColor = MaterialTheme.colorScheme.surfaceVariant
    val annotatedText = remember(inlines, color, fontWeight, linkColor, codeBackgroundColor) {
        buildAnnotatedString {
            inlines.forEach { inline ->
                when (inline) {
                    is MarkdownInline.Text -> withStyle(
                        SpanStyle(color = color, fontWeight = fontWeight),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Strong -> withStyle(
                        SpanStyle(color = color, fontWeight = FontWeight.SemiBold),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Emphasis -> withStyle(
                        SpanStyle(color = color, fontStyle = FontStyle.Italic, fontWeight = fontWeight),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Strikethrough -> withStyle(
                        SpanStyle(
                            color = color,
                            fontWeight = fontWeight,
                            textDecoration = TextDecoration.LineThrough,
                        ),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Code -> withStyle(
                        SpanStyle(
                            color = color,
                            background = codeBackgroundColor,
                            fontFamily = FontFamily.Monospace,
                        ),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Mention -> withStyle(
                        SpanStyle(color = linkColor, fontWeight = FontWeight.SemiBold),
                    ) {
                        append(inline.label)
                    }
                    is MarkdownInline.Link -> {
                        withLink(
                            LinkAnnotation.Url(
                                url = inline.url,
                                styles = TextLinkStyles(
                                    style = SpanStyle(
                                        color = linkColor,
                                        fontWeight = FontWeight.SemiBold,
                                        textDecoration = TextDecoration.Underline,
                                    ),
                                ),
                            ),
                        ) {
                            append(inline.label)
                        }
                    }
                }
            }
        }
    }
    Text(
        text = annotatedText,
        modifier = modifier,
        style = style.copy(color = color, fontWeight = fontWeight),
    )
}

@Composable
private fun DustAvatar(
    name: String?,
    avatarUrl: String? = null,
    size: Dp = 28.dp,
    isAgent: Boolean = false,
) {
    val emojiAvatar = avatarUrl?.let(::parseEmojiAvatarUrl)
    val bundledAvatarRes = avatarUrl?.let(::bundledAvatarResource)
    val remoteAvatarUrl = avatarUrl?.takeIf {
        it.isNotBlank() && emojiAvatar == null && bundledAvatarRes == null
    }
    var remoteBitmap by remember(remoteAvatarUrl) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(remoteAvatarUrl) {
        remoteBitmap = remoteAvatarUrl?.let { loadAvatarBitmap(it) }
    }
    val initial = avatarInitial(name)
    val shape = if (isAgent) {
        RoundedCornerShape(
            when {
                size <= 20.dp -> 4.dp
                size <= 28.dp -> 6.dp
                else -> 8.dp
            },
        )
    } else {
        CircleShape
    }
    val palette = sparkleAvatarPalette(name.orEmpty())
    val hasVisual = bundledAvatarRes != null || remoteBitmap != null
    Box(
        modifier = Modifier
            .size(size)
            .semantics { contentDescription = "${name ?: "User"} avatar" }
            .background(
                emojiAvatar?.let { emojiAvatarBackgroundColor(it.backgroundToken) }
                    ?: palette.background,
                shape,
            )
            .then(
                if (hasVisual) {
                    Modifier
                } else {
                    Modifier.border(1.dp, palette.foreground.copy(alpha = 0.12f), shape)
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        val bitmap = remoteBitmap
        when {
            bundledAvatarRes != null -> Image(
                painter = painterResource(bundledAvatarRes),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape),
                contentScale = ContentScale.Crop,
            )
            bitmap != null -> Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape),
                contentScale = ContentScale.Crop,
            )
            else -> Text(
                emojiAvatar?.emoji ?: initial,
                style = MaterialTheme.typography.labelSmall,
                color = if (emojiAvatar != null) {
                    Color.Unspecified
                } else {
                    palette.foreground
                },
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

internal fun avatarInitial(name: String?): String =
    name?.firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "U"

private suspend fun loadAvatarBitmap(urlString: String): Bitmap? =
    withContext(Dispatchers.IO) {
        avatarBitmapCache.get(urlString) ?: runCatching {
            val connection = URL(urlString).openConnection()
            connection.connectTimeout = AVATAR_CONNECT_TIMEOUT_MS
            connection.readTimeout = AVATAR_READ_TIMEOUT_MS
            connection.getInputStream().use(BitmapFactory::decodeStream)
        }.getOrNull()?.also { bitmap -> avatarBitmapCache.put(urlString, bitmap) }
    }

private fun bundledAvatarResource(urlString: String): Int? =
    when (urlString.substringBefore('?').substringAfterLast('/')) {
        "dust_avatar_full.png" -> R.drawable.dust_agent_avatar
        "Droid_Lime_1.jpg" -> R.drawable.droid_lime_1
        "Droid_Pink_3.jpg" -> R.drawable.droid_pink_3
        "Droid_Yellow_2.jpg" -> R.drawable.droid_yellow_2
        else -> null
    }

private data class AvatarPalette(val background: Color, val foreground: Color)

private fun sparkleAvatarPalette(name: String): AvatarPalette {
    var hash = 0
    name.forEach { character ->
        hash = character.code + ((hash shl 5) - hash)
    }
    return SPARKLE_AVATAR_PALETTES[(hash and Int.MAX_VALUE) % SPARKLE_AVATAR_PALETTES.size]
}

private val avatarBitmapCache = LruCache<String, Bitmap>(32)

private val SPARKLE_AVATAR_PALETTES = listOf(
    AvatarPalette(background = Color(0xFF7AC6FF), foreground = Color(0xFF0A6CC6)),
    AvatarPalette(background = Color(0xFFC4B4FF), foreground = Color(0xFF7008E7)),
    AvatarPalette(background = Color(0xFFF99BC3), foreground = Color(0xFFB8315E)),
    AvatarPalette(background = Color(0xFFEC8874), foreground = Color(0xFFB22E13)),
    AvatarPalette(background = Color(0xFFFFB86A), foreground = Color(0xFFCA3500)),
    AvatarPalette(background = Color(0xFFFFD046), foreground = Color(0xFFE27716)),
    AvatarPalette(background = Color(0xFFCCF16E), foreground = Color(0xFF4D7C0F)),
    AvatarPalette(background = Color(0xFF82EFB8), foreground = Color(0xFF277644)),
)

private fun emojiAvatarBackgroundColor(token: String): Color {
    val familyToken = token.substringBeforeLast("-", missingDelimiterValue = token)
    val family = EMOJI_AVATAR_FAMILY_ALIASES[familyToken] ?: familyToken
    return when (family) {
        "blue" -> Color(0xFFBFDBFE)
        "emerald" -> Color(0xFFA7F3D0)
        "golden" -> Color(0xFFFDE68A)
        "gray" -> Color(0xFFE5E7EB)
        "green" -> Color(0xFFBBF7D0)
        "lime" -> Color(0xFFD9F99D)
        "orange" -> Color(0xFFFED7AA)
        "pink" -> Color(0xFFFBCFE8)
        "red" -> Color(0xFFFECACA)
        "rose" -> Color(0xFFFFE4E6)
        "violet" -> Color(0xFFDDD6FE)
        else -> Color(0xFFE5E7EB)
    }
}

private val EMOJI_AVATAR_FAMILY_ALIASES = mapOf(
    "yellow" to "golden",
    "amber" to "golden",
    "sky" to "blue",
    "cyan" to "blue",
    "teal" to "emerald",
    "indigo" to "violet",
    "purple" to "violet",
    "fuchsia" to "pink",
    "slate" to "gray",
    "zinc" to "gray",
    "neutral" to "gray",
    "stone" to "gray",
)

@Composable
private fun AgentMessageContent(
    message: com.dust.mobile.core.model.AgentMessage,
    lastError: ErrorInfo?,
    hideHeader: Boolean,
    streamingActivity: AgentMessageStream.Activity?,
    activeActions: List<ActiveAction>,
    completedSteps: List<ActivityStep>,
    blockedState: BlockedState?,
    isValidatingAction: Boolean,
    actionError: String?,
    onOpenGeneratedFile: ((GeneratedFile) -> Unit)?,
    onOpenCitation: ((CitationReference) -> Unit)?,
    onRetryMessage: (String) -> Unit,
    onValidateAction: (ActionApproval) -> Unit,
    onAnswerQuestion: (UserQuestionAnswer) -> Unit,
    onOpenInBrowser: (() -> Unit)?,
    currentUserSId: String?,
) {
    val rendered = remember(message.content) { renderAgentMessage(message.content.orEmpty()) }
    if (!hideHeader) {
        val timestamp = remember(message.created) { formatMessageTimestamp(message.created) }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DustAvatar(
                name = message.configuration.name,
                avatarUrl = message.configuration.pictureUrl,
                size = 28.dp,
                isAgent = true,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    message.configuration.name,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                MessageTimestamp(timestamp)
            }
        }
        Spacer(Modifier.height(16.dp))
    }
    if (message.isStreaming || completedSteps.isNotEmpty() || activeActions.isNotEmpty()) {
        ActivityTimeline(
            activity = streamingActivity,
            chainOfThought = message.chainOfThought,
            completedSteps = completedSteps,
            activeActions = activeActions,
            isStreaming = message.isStreaming,
            isBlocking = blockedState != null,
        )
    }
    if (rendered.displayText.isNotBlank()) {
        DustMarkdownText(rendered.displayText, selectable = !message.isStreaming)
    }
    val files = displayableGeneratedFiles(message)
    if (files.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        GeneratedFileChips(files = files, onOpen = onOpenGeneratedFile)
    }
    val activeCitations = remember(rendered.citeMapping, message.citations) {
        activeCitationEntries(rendered.citeMapping, message.citations)
    }
    if (!message.isStreaming && activeCitations.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        CitationSection(entries = activeCitations, onOpen = onOpenCitation)
    }
    if (message.isStreaming && blockedState != null) {
        Spacer(Modifier.height(8.dp))
        BlockedActionCard(
            blockedState = blockedState,
            isLoading = isValidatingAction,
            error = actionError,
            onValidate = onValidateAction,
            onAnswer = onAnswerQuestion,
            onOpenInBrowser = onOpenInBrowser,
            currentUserSId = currentUserSId,
        )
    }
    val errorInfo = lastError ?: remember(message.error, message.sId) {
        message.error?.let { ErrorInfo.from(it, message.sId) }
    }
    if (message.status == AgentMessageStatus.FAILED && errorInfo != null) {
        Spacer(Modifier.height(8.dp))
        ErrorCard(error = errorInfo, onRetry = { onRetryMessage(message.sId) })
    }
}

@Composable
private fun ActivityTimeline(
    activity: AgentMessageStream.Activity?,
    chainOfThought: String?,
    completedSteps: List<ActivityStep>,
    activeActions: List<ActiveAction>,
    isStreaming: Boolean,
    isBlocking: Boolean,
) {
    var collapsed by remember(isStreaming) { mutableStateOf(false) }
    var expandedThinkingIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    val display = remember(
        activity,
        chainOfThought,
        completedSteps,
        activeActions,
        isStreaming,
        expandedThinkingIds,
    ) {
        activityTimelineDisplay(
            isStreaming = isStreaming,
            isGenerating = activity == AgentMessageStream.Activity.GENERATING,
            isBlocking = isBlocking,
            chainOfThought = chainOfThought,
            completedSteps = completedSteps,
            activeActions = activeActions,
            expandedThinkingIds = expandedThinkingIds,
        )
    }
    if (display.rows.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        display.headerLabel?.let { label ->
            Row(
                modifier = Modifier.clickable { collapsed = !collapsed },
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    painter = painterResource(R.drawable.ic_chevron_right_24),
                    contentDescription = if (collapsed) "Expand activity" else "Collapse activity",
                    modifier = Modifier
                        .size(9.dp)
                        .graphicsLayer { rotationZ = if (collapsed) 0f else 90f },
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (display.headerLabel == null || !collapsed) {
            display.rows.forEach { row ->
                ActivityTimelineRowView(
                    row = row,
                    onToggleThinking = {
                        expandedThinkingIds = if (row.id in expandedThinkingIds) {
                            expandedThinkingIds - row.id
                        } else {
                            expandedThinkingIds + row.id
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ActivityTimelineRowView(
    row: ActivityTimelineRow,
    onToggleThinking: () -> Unit,
) {
    val rowModifier = if (row.kind == ActivityTimelineRowKind.THINKING && row.isExpandable) {
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggleThinking)
    } else {
        Modifier.fillMaxWidth()
    }
    Row(
        modifier = rowModifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        ActivityTimelineMarker(row.kind)
        val label = row.serverName?.let { serverName ->
            row.label?.let { "$it · $serverName" }
        } ?: row.label
        Text(
            label.orEmpty(),
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall,
            color = when (row.kind) {
                ActivityTimelineRowKind.ACTIVE_ACTION -> MaterialTheme.colorScheme.secondary
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
            maxLines = if (row.kind == ActivityTimelineRowKind.ACTION || row.kind == ActivityTimelineRowKind.ACTIVE_ACTION) {
                1
            } else {
                Int.MAX_VALUE
            },
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ActivityTimelineMarker(kind: ActivityTimelineRowKind) {
    Box(
        modifier = Modifier.size(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        when (kind) {
            ActivityTimelineRowKind.ACTIVE_ACTION,
            ActivityTimelineRowKind.IDLE,
            -> CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
            ActivityTimelineRowKind.DONE -> Icon(
                painter = painterResource(R.drawable.ic_check_24),
                contentDescription = null,
                modifier = Modifier.size(11.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ActivityTimelineRowKind.ACTION -> Icon(
                painter = painterResource(R.drawable.ic_tune_24),
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ActivityTimelineRowKind.ACTIVE_THINKING,
            ActivityTimelineRowKind.THINKING,
            -> Box(
                modifier = Modifier
                    .size(8.dp)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
            )
        }
    }
}

@Composable
private fun ErrorCard(
    error: ErrorInfo,
    onRetry: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(8.dp)
                        .background(MaterialTheme.colorScheme.error, CircleShape),
                )
                Text(
                    error.errorTitle ?: "Something went wrong",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Text(error.message, style = MaterialTheme.typography.bodySmall)
            if (error.isRetryable) {
                TextButton(
                    onClick = onRetry,
                    contentPadding = PaddingValues(0.dp),
                ) {
                    Text("Retry", color = MaterialTheme.colorScheme.secondary)
                }
            }
        }
    }
}

@Composable
private fun ContentFragmentChips(
    fragments: List<ContentFragment>,
    onOpen: ((ContentFragment) -> Unit)?,
    loadImage: (suspend (String) -> ByteArray?)?,
) {
    fragments.forEach { fragment ->
        val fileId = fragment.fileId
        if (fragment.isImage && fileId != null && loadImage != null) {
            AttachmentImagePreview(
                fragment = fragment,
                fileId = fileId,
                loadImage = loadImage,
                onOpen = onOpen,
            )
        } else {
            ContentFragmentChip(fragment = fragment, onOpen = onOpen)
        }
    }
}

@Composable
private fun AttachmentImagePreview(
    fragment: ContentFragment,
    fileId: String,
    loadImage: suspend (String) -> ByteArray?,
    onOpen: ((ContentFragment) -> Unit)?,
) {
    var imageState by remember(fileId) { mutableStateOf<AttachmentImageState>(AttachmentImageState.Loading) }
    LaunchedEffect(fileId, loadImage) {
        val imageData = loadImage(fileId)
        val bitmap = imageData?.let { data ->
            withContext(Dispatchers.Default) { decodeAttachmentThumbnail(data) }
        }
        imageState = if (bitmap == null) {
            AttachmentImageState.Failed
        } else {
            AttachmentImageState.Loaded(bitmap)
        }
    }
    when (val current = imageState) {
        AttachmentImageState.Loading -> Box(
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        }
        AttachmentImageState.Failed -> ContentFragmentChip(fragment = fragment, onOpen = onOpen)
        is AttachmentImageState.Loaded -> Image(
            bitmap = current.bitmap.asImageBitmap(),
            contentDescription = fragment.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(enabled = onOpen != null) { onOpen?.invoke(fragment) },
        )
    }
}

private sealed interface AttachmentImageState {
    data object Loading : AttachmentImageState
    data object Failed : AttachmentImageState
    data class Loaded(val bitmap: Bitmap) : AttachmentImageState
}

private fun decodeAttachmentThumbnail(data: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 256 || bounds.outHeight / sampleSize > 256) {
        sampleSize *= 2
    }
    return BitmapFactory.decodeByteArray(
        data,
        0,
        data.size,
        BitmapFactory.Options().apply { inSampleSize = sampleSize },
    )
}

@Composable
private fun ContentFragmentChip(
    fragment: ContentFragment,
    onOpen: ((ContentFragment) -> Unit)?,
) {
    DocumentLink(
        label = fragment.title,
        contentType = fragment.contentType,
        enabled = fragment.fileId != null && onOpen != null,
        onClick = { onOpen?.invoke(fragment) },
    )
}

@Composable
private fun GeneratedFileChips(
    files: List<GeneratedFile>,
    onOpen: ((GeneratedFile) -> Unit)?,
) {
    files.forEach { file ->
        DocumentLink(
            label = file.title,
            contentType = file.contentType,
            enabled = file.fileId != null && onOpen != null,
            onClick = { onOpen?.invoke(file) },
        )
    }
}

@Composable
private fun DocumentLink(
    label: String,
    contentType: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, onClick = onClick),
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (enabled) {
            MaterialTheme.colorScheme.onSurface
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        shape = RoundedCornerShape(10.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = painterResource(
                    if (isImageContentType(contentType)) R.drawable.ic_image_24 else R.drawable.ic_document_24,
                ),
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.secondary,
            )
            Text(
                label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun CitationSection(
    entries: List<CitationDisplayEntry>,
    onOpen: ((CitationReference) -> Unit)?,
) {
    var expanded by remember(entries) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.clickable { expanded = !expanded },
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (entries.size == 1) {
                    "1 source"
                } else {
                    "${entries.size} sources"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = if (expanded) "Hide sources" else "Show sources",
                modifier = Modifier
                    .size(10.dp)
                    .graphicsLayer { rotationZ = if (expanded) 90f else 0f },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (expanded) {
            entries.forEach { entry ->
                val enabled = entry.citation.href != null && onOpen != null
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp)
                        .clickable(enabled = enabled) { onOpen?.invoke(entry.citation) },
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_document_24),
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                        Text(
                            "${entry.number}. ${entry.citation.title}",
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (entry.citation.href != null) {
                            Icon(
                                painter = painterResource(R.drawable.ic_open_in_browser_24),
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlockedActionCard(
    blockedState: BlockedState?,
    isLoading: Boolean,
    error: String?,
    onValidate: (ActionApproval) -> Unit,
    onAnswer: (UserQuestionAnswer) -> Unit,
    onOpenInBrowser: (() -> Unit)?,
    currentUserSId: String?,
) {
    if (blockedState == null && error == null) return
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            when (blockedState) {
                is BlockedState.Approval -> {
                    val canRespond = canRespondToBlockedAction(
                        blockedState.approval.triggeringUserId,
                        currentUserSId,
                    )
                    val approvalDisplay = remember(blockedState.approval) {
                        toolApprovalDisplay(blockedState.approval)
                    }
                    var showDetails by remember(blockedState.approval.actionId) { mutableStateOf(false) }
                    val hasInputs = approvalDisplay.inputs.isNotEmpty()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = hasInputs) { showDetails = !showDetails },
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_tune_24),
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            approvalDisplay.title,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        if (hasInputs) {
                            Icon(
                                painter = painterResource(R.drawable.ic_chevron_right_24),
                                contentDescription = if (showDetails) "Hide details" else "Show details",
                                modifier = Modifier
                                    .size(10.dp)
                                    .graphicsLayer { rotationZ = if (showDetails) 90f else 0f },
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (showDetails) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                approvalDisplay.inputs.forEach { (key, value) ->
                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            key,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Text(value, style = MaterialTheme.typography.bodySmall, maxLines = 6)
                                    }
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    if (canRespond) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (approvalDisplay.canAlwaysAllow) {
                                BlockedPrimaryButton(
                                    label = "Always allow",
                                    enabled = !isLoading,
                                    onClick = { onValidate(ActionApproval.ALWAYS_APPROVED) },
                                )
                                TextButton(
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = !isLoading,
                                    onClick = { onValidate(ActionApproval.APPROVED) },
                                ) {
                                    Text(approvalDisplay.approveLabel)
                                }
                            } else {
                                BlockedPrimaryButton(
                                    label = approvalDisplay.approveLabel,
                                    enabled = !isLoading,
                                    onClick = { onValidate(ActionApproval.APPROVED) },
                                )
                            }
                            TextButton(
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !isLoading,
                                onClick = { onValidate(ActionApproval.REJECTED) },
                            ) {
                                Text("Decline")
                            }
                        }
                    } else {
                        BlockedWaitingView("Waiting for a teammate to approve this.")
                    }
                }
                is BlockedState.PersonalAuth -> {
                    Text(
                        "${blockedState.provider} needs authentication",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Text(
                        "Connect this service in the web app to continue.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    onOpenInBrowser?.let {
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = it,
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Text("Open in Dust")
                        }
                    }
                }
                is BlockedState.FileAuth -> {
                    Text("File access required", style = MaterialTheme.typography.labelLarge)
                    Text(
                        "${blockedState.toolName} needs access to ${blockedState.fileName}.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    onOpenInBrowser?.let {
                        OutlinedButton(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = it,
                            shape = RoundedCornerShape(10.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Text("Open in Dust")
                        }
                    }
                }
                is BlockedState.UserQuestionRequired -> {
                    val canRespond = canRespondToBlockedAction(
                        blockedState.question.triggeringUserId,
                        currentUserSId,
                    )
                    UserQuestionCard(
                        question = blockedState.question.question,
                        isLoading = isLoading,
                        canRespond = canRespond,
                        onAnswer = onAnswer,
                    )
                }
                null -> Unit
            }
            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun BlockedPrimaryButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp),
        enabled = enabled,
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.secondary,
            contentColor = MaterialTheme.colorScheme.onSecondary,
        ),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun BlockedWaitingView(label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UserQuestionCard(
    question: UserQuestion,
    isLoading: Boolean,
    canRespond: Boolean,
    onAnswer: (UserQuestionAnswer) -> Unit,
) {
    var selectedOptions by remember(question) { mutableStateOf<Set<Int>>(emptySet()) }
    var customResponse by remember(question) { mutableStateOf("") }
    val answer = remember(selectedOptions, customResponse) {
        buildUserQuestionAnswer(selectedOptions, customResponse)
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(question.question, style = MaterialTheme.typography.labelLarge)
        if (!canRespond) {
            BlockedWaitingView("Waiting for a teammate to respond.")
            return@Column
        }
        question.options.forEachIndexed { index, option ->
            val isSelected = selectedOptions.contains(index)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !isLoading) {
                        selectedOptions = if (question.multiSelect) {
                            if (isSelected) selectedOptions - index else selectedOptions + index
                        } else {
                            setOf(index)
                        }
                    },
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(
                    1.dp,
                    if (isSelected) MaterialTheme.colorScheme.secondary else Color.Transparent,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (isSelected) {
                        Icon(
                            painter = painterResource(R.drawable.ic_check_circle_24),
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                    } else {
                        Box(
                            Modifier
                                .size(16.dp)
                                .border(1.dp, MaterialTheme.colorScheme.onSurfaceVariant, CircleShape),
                        )
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(option.label, style = MaterialTheme.typography.labelMedium)
                        option.description?.takeIf { it.isNotBlank() }?.let { description ->
                            Text(
                                description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            BasicTextField(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(10.dp),
                value = customResponse,
                onValueChange = { customResponse = it },
                enabled = !isLoading,
                minLines = 1,
                maxLines = 4,
                textStyle = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.secondary),
                decorationBox = { innerTextField ->
                    Box {
                        if (customResponse.isEmpty()) {
                            Text(
                                "Type something else",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        innerTextField()
                    }
                },
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        BlockedPrimaryButton(
            label = "Send",
            enabled = !isLoading && answer != null,
            onClick = { answer?.let(onAnswer) },
        )
        TextButton(
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
            onClick = { onAnswer(UserQuestionAnswer(selectedOptions = emptyList(), customResponse = null)) },
        ) {
            Text("Skip")
        }
    }
}

@Composable
private fun ConversationFilesScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    conversation: Conversation,
    onOpenAttachment: (ConversationAttachment) -> Unit,
) {
    val viewModel: ConversationFilesViewModel = viewModel(
        key = "files-${conversation.sId}",
        factory = factory {
            ConversationFilesViewModel(graph, tokenProvider, isLocalPreview, workspaceId, conversation.sId)
        },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(conversation.sId) {
        viewModel.load()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        when {
            state.isLoading -> LoadingScreen()
            state.error != null -> ErrorScreen(state.error ?: "Failed to load files", viewModel::load)
            state.attachments.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "No files in this conversation",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 24.dp),
            ) {
                AttachmentCategory.entries.forEach { category ->
                    val attachments = state.attachments.filter { it.category == category }
                    if (attachments.isNotEmpty()) {
                        item {
                            ConversationSectionHeader(category.displayName)
                        }
                        items(attachments, key = { it.id }) { attachment ->
                            FileRow(attachment = attachment, onOpen = { onOpenAttachment(attachment) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FileRow(attachment: ConversationAttachment, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = attachment.fileId != null, onClick = onOpen)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FileIconTile(attachment = attachment)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                attachment.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            attachment.source?.let { source ->
                Text(
                    "by $source",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (attachment.isFrame) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun FileIconTile(attachment: ConversationAttachment) {
    val isAccent = attachment.isFrame
    Icon(
        painter = painterResource(
            if (attachment.isImage) {
                R.drawable.ic_image_24
            } else {
                R.drawable.ic_document_24
            },
        ),
        contentDescription = null,
        modifier = Modifier.size(28.dp),
        tint = if (isAccent) {
            MaterialTheme.colorScheme.secondary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
    )
}

@Composable
private fun AttachmentViewerScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    title: String,
    contentType: String,
    fileId: String,
    sourceUrl: String?,
) {
    val viewModel: AttachmentViewerViewModel = viewModel(
        key = "viewer-$fileId",
        factory = factory { AttachmentViewerViewModel(graph, tokenProvider, isLocalPreview, workspaceId, fileId) },
    )
    val state by viewModel.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    val isFrame = contentType.startsWith(FRAME_CONTENT_TYPE_PREFIX)
    var framePageTitle by remember(fileId) { mutableStateOf("") }

    LaunchedEffect(fileId) {
        viewModel.load()
    }

    Column(Modifier.fillMaxSize()) {
        if (isFrame && framePageTitle.isNotEmpty() && framePageTitle != title) {
            Text(
                framePageTitle,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
        }
        val data = state.data
        when {
            state.isLoading -> LoadingScreen()
            state.error != null -> ErrorScreen(state.error ?: "Failed to load file", viewModel::load)
            data != null -> AttachmentContent(
                title = title,
                contentType = contentType,
                fileId = fileId,
                data = data,
                appUrl = graph.config.appUrl,
                vizUrl = graph.config.vizUrl,
                sourceUrl = sourceUrl,
                onOpenSource = { url -> uriHandler.openUri(url) },
                onFramePageTitle = { framePageTitle = it },
                fetchFrameFile = { targetFileId ->
                    graph.fileRepository.fetchFileContent(workspaceId, targetFileId, tokenProvider)
                },
            )
        }
    }
}

@Composable
private fun AttachmentContent(
    title: String,
    contentType: String,
    fileId: String,
    data: ByteArray,
    appUrl: String,
    vizUrl: String,
    sourceUrl: String?,
    onOpenSource: (String) -> Unit,
    onFramePageTitle: (String) -> Unit,
    fetchFrameFile: suspend (String) -> FrameFileContent,
) {
    val textPreview = remember(data) { decodeUtf8TextOrNull(data) }
    when (remember(contentType, data) { attachmentPreviewRoute(contentType, data) }) {
        AttachmentPreviewRoute.FRAME -> {
            val code = textPreview ?: return
            var frameError by remember(fileId) { mutableStateOf<String?>(null) }
            var isFrameLoading by remember(fileId) { mutableStateOf(true) }
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f)) {
                    FrameWebView(
                        html = buildFrameWrapperHtml(code, fileId, vizUrl),
                        baseUrl = appUrl,
                        modifier = Modifier.fillMaxSize(),
                        fetchFile = fetchFrameFile,
                        onFrameError = { frameError = it },
                        onPageTitleChange = onFramePageTitle,
                        onLoadingChange = { isFrameLoading = it },
                    )
                    if (isFrameLoading) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                }
                frameError?.let {
                    Text(
                        it,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        AttachmentPreviewRoute.IMAGE -> ImagePreview(data)
        AttachmentPreviewRoute.PDF -> PdfPreview(data)
        AttachmentPreviewRoute.TEXT -> TextPreview(textPreview ?: return)
        AttachmentPreviewRoute.OTHER -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title)
            Text(contentType, color = MaterialTheme.colorScheme.onSurfaceVariant)
            sourceUrl?.let {
                Button(onClick = { onOpenSource(it) }) {
                    Text("Open source")
                }
            }
        }
    }
}

@Composable
private fun ImagePreview(data: ByteArray) {
    val bitmap = remember(data) { BitmapFactory.decodeByteArray(data, 0, data.size) }
    if (bitmap == null) {
        Text("Could not decode image", modifier = Modifier.padding(16.dp))
    } else {
        var scale by remember(data) { mutableStateOf(1f) }
        var offset by remember(data) { mutableStateOf(Offset.Zero) }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clipToBounds()
                .pointerInput(data) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val nextScale = (scale * zoom).coerceIn(1f, 5f)
                        scale = nextScale
                        offset = if (nextScale == 1f) Offset.Zero else offset + pan
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offset.x
                        translationY = offset.y
                    },
            )
        }
    }
}

@Composable
private fun TextPreview(text: String) {
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            DustMarkdownText(
                content = text,
                modifier = Modifier.padding(16.dp),
                selectable = true,
            )
        }
    }
}

@Composable
private fun PdfPreview(data: ByteArray) {
    val context = LocalContext.current
    val pages = remember(data) { renderPdfPages(context.cacheDir, data) }
    if (pages.isEmpty()) {
        Text("Could not render PDF", modifier = Modifier.padding(16.dp))
    } else {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(pages) { bitmap ->
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                )
            }
        }
    }
}

private fun renderPdfPages(cacheDir: File, data: ByteArray): List<Bitmap> {
    val file = File.createTempFile("dust-preview", ".pdf", cacheDir)
    return try {
        file.writeBytes(data)
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
            PdfRenderer(descriptor).use { renderer ->
                (0 until renderer.pageCount).map { index ->
                    renderer.openPage(index).use { page ->
                        val bitmap = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bitmap
                    }
                }
            }
        }
    } finally {
        file.delete()
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun FrameWebView(
    html: String,
    baseUrl: String,
    modifier: Modifier = Modifier,
    fetchFile: (suspend (String) -> FrameFileContent)? = null,
    onFrameError: (String) -> Unit = {},
    onPageTitleChange: (String) -> Unit = {},
    onLoadingChange: (Boolean) -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var webViewRestartKey by remember(html, baseUrl) { mutableStateOf(0) }
    key(webViewRestartKey) {
        AndroidView(
            modifier = modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webChromeClient = object : WebChromeClient() {
                        override fun onReceivedTitle(view: WebView?, title: String?) {
                            if (!title.isNullOrBlank()) {
                                onPageTitleChange(title)
                            }
                        }
                    }
                    webViewClient = embeddedWebViewClient(
                        allowedUrl = baseUrl,
                        openExternal = { externalUrl ->
                            runCatching {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(externalUrl)))
                            }
                        },
                        onLoadingChange = onLoadingChange,
                        onRendererGone = {
                            onLoadingChange(true)
                            webViewRestartKey += 1
                        },
                    )
                    if (fetchFile != null) {
                        addJavascriptInterface(
                            FrameBridge(
                                scope = scope,
                                webView = this,
                                fetchFile = fetchFile,
                                onFrameError = onFrameError,
                            ),
                            "DustFrameBridge",
                        )
                    }
                    tag = html
                    loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null)
                }
            },
            update = { webView ->
                if (webView.tag != html) {
                    webView.tag = html
                    webView.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null)
                }
            },
        )
    }
}

private fun embeddedWebViewClient(
    allowedUrl: String,
    openExternal: (String) -> Unit,
    onLoadingChange: (Boolean) -> Unit = {},
    onRendererGone: () -> Unit = {},
): WebViewClient {
    val allowedHost = Uri.parse(allowedUrl).host
    return object : WebViewClient() {
        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            onLoadingChange(true)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            onLoadingChange(false)
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
            if (request?.isForMainFrame != false) {
                onLoadingChange(false)
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
            val targetUrl = request.url.toString()
            if (DeepLinkRouter.shouldOpenInEmbeddedWebView(targetUrl, allowedHost)) {
                return false
            }

            openExternal(targetUrl)
            return true
        }

        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
            onRendererGone()
            return true
        }
    }
}

private class FrameBridge(
    private val scope: CoroutineScope,
    private val webView: WebView,
    private val fetchFile: suspend (String) -> FrameFileContent,
    private val onFrameError: (String) -> Unit,
) {
    @JavascriptInterface
    fun getFile(messageUniqueId: String, fileId: String) {
        scope.launch {
            runCatching {
                fetchFile(fileId)
            }.onSuccess { content ->
                val base64 = Base64.encodeToString(content.data, Base64.NO_WRAP)
                val contentType = content.contentType ?: "application/octet-stream"
                answerFile(messageUniqueId, base64, contentType)
            }.onFailure {
                answerFile(messageUniqueId, null, null)
            }
        }
    }

    @JavascriptInterface
    fun setErrorMessage(message: String) {
        webView.post { onFrameError(message) }
    }

    private fun answerFile(messageUniqueId: String, base64: String?, contentType: String?) {
        val script = "window.__dustAnswerFile(" +
            "${JSONObject.quote(messageUniqueId)}," +
            "${base64?.let(JSONObject::quote) ?: "null"}," +
            "${contentType?.let(JSONObject::quote) ?: "null"}" +
            ");"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}

@Suppress("UNCHECKED_CAST")
private fun <T : ViewModel> factory(create: () -> T): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        override fun <VM : ViewModel> create(modelClass: Class<VM>): VM = create() as VM
    }
