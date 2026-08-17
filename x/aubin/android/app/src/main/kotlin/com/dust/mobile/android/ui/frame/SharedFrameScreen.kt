package com.dust.mobile.android.ui.frame

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustTopBar
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import kotlinx.coroutines.delay

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FrameShareViewer(url: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val isImeVisible = WindowInsets.isImeVisible
    val backgroundColor = MaterialTheme.colorScheme.background.toArgb()
    var pageTitle by remember(url) { mutableStateOf("") }
    var isLoading by remember(url) { mutableStateOf(true) }
    var loadError by remember(url) { mutableStateOf<String?>(null) }
    var webViewRestartKey by remember(url) { mutableStateOf(0) }

    BackHandler {
        if (isImeVisible) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        } else {
            onDismiss()
        }
    }

    LaunchedEffect(url, webViewRestartKey, isLoading) {
        if (isLoading) {
            delay(FRAME_READY_TIMEOUT_MS)
            if (isLoading) {
                isLoading = false
                loadError = "This Frame is taking too long to load."
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        DustTopBar(
            title = pageTitle.ifEmpty { "Frame" },
            onBack = onDismiss,
            navigationIconRes = R.drawable.ic_close_24,
            navigationContentDescription = "Close frame",
            actions = {
                DustIconButton(
                    onClick = {
                        runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        }
                    },
                    iconRes = R.drawable.ic_open_in_browser_24,
                    contentDescription = "Open frame in browser",
                )
                DustIconButton(
                    onClick = {
                        val shareIntent = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, url)
                        context.startActivity(Intent.createChooser(shareIntent, "Share frame"))
                    },
                    iconRes = R.drawable.ic_share_24,
                    contentDescription = "Share frame",
                )
            },
        )
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .navigationBarsPadding(),
        ) {
            key(webViewRestartKey) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { context ->
                        WebView(context).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            setBackgroundColor(backgroundColor)
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
                                onLoadingChange = { loading ->
                                    isLoading = loading
                                    if (loading) {
                                        loadError = null
                                    }
                                },
                                onPageError = {
                                    isLoading = false
                                    loadError = "This Frame could not be loaded."
                                },
                                onRendererGone = {
                                    isLoading = false
                                    loadError = "This Frame stopped responding."
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
                    onRelease = ::releaseWebView,
                )
            }
            when {
                loadError != null -> FrameLoadError(
                    message = loadError.orEmpty(),
                    onRetry = {
                        loadError = null
                        isLoading = true
                        webViewRestartKey += 1
                    },
                )
                isLoading -> LoadingPlaceholder(
                    iconRes = R.drawable.ic_frame_24,
                    label = "Loading Frame",
                )
            }
        }
    }
}

@Composable
internal fun FrameLoadError(message: String, onRetry: () -> Unit) {
    DustFeedbackState(
        iconRes = R.drawable.ic_frame_24,
        title = "Frame unavailable",
        message = message,
        actionLabel = "Try again",
        onAction = onRetry,
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    )
}

internal fun releaseWebView(webView: WebView) {
    webView.stopLoading()
    webView.removeJavascriptInterface("DustFrameBridge")
    webView.webChromeClient = null
    webView.webViewClient = WebViewClient()
    webView.destroy()
}
