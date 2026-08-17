package com.dust.mobile.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.auth.LoginScreen
import com.dust.mobile.android.ui.auth.SESSION_EXPIRED_NOTICE
import com.dust.mobile.android.ui.theme.DustTheme

class DemoPresentationActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = intent.getStringExtra("screen") ?: "inbox"
        setContent {
            DustTheme {
                when (screen) {
                    "loading" -> DemoLoadingScreen()
                    "inbox-loading" -> DemoInboxLoadingScreen()
                    "session-expired" -> LoginScreen(
                        onLogin = {},
                        onSignUp = {},
                        notice = SESSION_EXPIRED_NOTICE,
                    )
                    "empty-inbox" -> DemoEmptyInboxScreen()
                    "compose" -> DemoComposeScreen()
                    "detail" -> DemoDetailScreen()
                    "detail-loading" -> DemoDetailLoadingScreen()
                    "frame-loading" -> DemoFrameLoadingScreen()
                    "thinking" -> DemoStreamingScreen(holdThinking = true)
                    "streaming" -> DemoStreamingScreen()
                    "files" -> DemoFilesScreen()
                    else -> DemoInboxScreen()
                }
            }
        }
    }
}

@Composable
private fun DemoLoadingScreen() {
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
            contentDescription = null,
            modifier = Modifier.size(width = 112.dp, height = 28.dp),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "Loading Dust",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}
