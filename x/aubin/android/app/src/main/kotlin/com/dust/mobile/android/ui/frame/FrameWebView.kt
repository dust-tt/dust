package com.dust.mobile.android.ui.frame

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.text
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.doOnLayout
import com.dust.mobile.core.config.DeepLinkRouter
import com.dust.mobile.core.repository.FrameFileContent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun FrameWebView(
    html: String,
    baseUrl: String,
    modifier: Modifier = Modifier,
    fetchFile: suspend (String) -> FrameFileContent,
    onFrameReady: () -> Unit,
    onFrameError: (String) -> Unit = {},
    onLoadingChange: (Boolean) -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val backgroundColor = MaterialTheme.colorScheme.background.toArgb()
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                setBackgroundColor(backgroundColor)
                webViewClient = embeddedWebViewClient(
                    allowedUrl = baseUrl,
                    openExternal = { externalUrl ->
                        runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(externalUrl)))
                        }
                    },
                    completeLoadingOnPageFinished = false,
                    onLoadingChange = onLoadingChange,
                    onPageError = { onFrameError("This Frame could not be loaded.") },
                    onRendererGone = { onFrameError("This Frame stopped responding.") },
                )
                addJavascriptInterface(
                    FrameBridge(
                        scope = scope,
                        webView = this,
                        fetchFile = fetchFile,
                        onFrameReady = onFrameReady,
                        onFrameError = onFrameError,
                    ),
                    "DustFrameBridge",
                )
                tag = html
                doOnLayout {
                    loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null)
                }
            }
        },
        update = { webView ->
            if (webView.tag != html) {
                webView.tag = html
                webView.doOnLayout {
                    webView.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null)
                }
            }
        },
        onRelease = ::releaseWebView,
    )
}

internal fun embeddedWebViewClient(
    allowedUrl: String,
    openExternal: (String) -> Unit,
    completeLoadingOnPageFinished: Boolean = true,
    onLoadingChange: (Boolean) -> Unit = {},
    onPageError: (String) -> Unit = {},
    onRendererGone: () -> Unit = {},
): WebViewClient {
    val allowedHost = Uri.parse(allowedUrl).host
    return object : WebViewClient() {
        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            onLoadingChange(true)
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            if (completeLoadingOnPageFinished) {
                onLoadingChange(false)
            }
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
            if (request?.isForMainFrame != false) {
                onLoadingChange(false)
                onPageError(error?.description?.toString().orEmpty())
            }
        }

        override fun onReceivedHttpError(
            view: WebView?,
            request: WebResourceRequest?,
            errorResponse: WebResourceResponse?,
        ) {
            if (request?.isForMainFrame == true) {
                onLoadingChange(false)
                onPageError(errorResponse?.reasonPhrase.orEmpty())
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
            val targetUrl = request.url.toString()
            if (
                shouldKeepWebViewNavigationEmbedded(
                    targetUrl = targetUrl,
                    allowedHost = allowedHost,
                    isForMainFrame = request.isForMainFrame,
                )
            ) {
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

internal fun shouldKeepWebViewNavigationEmbedded(
    targetUrl: String,
    allowedHost: String?,
    isForMainFrame: Boolean,
): Boolean =
    !isForMainFrame || DeepLinkRouter.shouldOpenInEmbeddedWebView(targetUrl, allowedHost)

private class FrameBridge(
    private val scope: CoroutineScope,
    private val webView: WebView,
    private val fetchFile: suspend (String) -> FrameFileContent,
    private val onFrameReady: () -> Unit,
    private val onFrameError: (String) -> Unit,
) {
    @JavascriptInterface
    fun frameReady() {
        webView.post { onFrameReady() }
    }

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

internal const val FRAME_READY_TIMEOUT_MS = 15_000L
