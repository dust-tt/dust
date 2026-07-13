package com.dust.mobile.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import com.dust.mobile.android.ui.DustApp
import com.dust.mobile.android.ui.theme.DustTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val pendingDeepLink = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)

        val graph = (application as DustApplication).graph
        setContent {
            DustTheme {
                DustApp(
                    graph = graph,
                    pendingDeepLink = pendingDeepLink,
                    openUrl = ::openUrl,
                    clearDeepLink = { pendingDeepLink.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        pendingDeepLink.value = uri.toString()
    }

    private fun openUrl(url: String) {
        val uri = url.toUri()
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        if (uri.path == "/api/workos/login") {
            customTabsIntent.intent.putExtra(EXTRA_ENABLE_EPHEMERAL_BROWSING, true)
        }
        customTabsIntent.launchUrl(this, uri)
    }

    private companion object {
        const val EXTRA_ENABLE_EPHEMERAL_BROWSING =
            "androidx.browser.customtabs.extra.ENABLE_EPHEMERAL_BROWSING"
    }
}
