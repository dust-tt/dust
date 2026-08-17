package com.dust.mobile.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.KeyboardShortcutInfo
import android.view.Menu
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import com.dust.mobile.android.ui.DustApp
import com.dust.mobile.android.share.IncomingShare
import com.dust.mobile.android.share.toIncomingShare
import com.dust.mobile.android.ui.theme.DustTheme
import com.dust.mobile.android.ui.navigation.AppKeyboardCommand
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MainActivity : ComponentActivity() {
    private val activityState: MainActivityState by viewModels()
    private val keyboardCommands = MutableSharedFlow<AppKeyboardCommand>(extraBufferCapacity = 1)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (!activityState.initialIntentHandled) {
            handleIntent(intent)
            activityState.markInitialIntentHandled()
        }

        val graph = (application as DustApplication).graph
        setContent {
            DustTheme {
                DustApp(
                    graph = graph,
                    pendingDeepLink = activityState.pendingDeepLink,
                    pendingShare = activityState.pendingShare,
                    keyboardCommands = keyboardCommands,
                    openUrl = ::openUrl,
                    clearDeepLink = activityState::clearDeepLink,
                    clearShare = activityState::clearShare,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onKeyShortcut(keyCode: Int, event: KeyEvent): Boolean {
        val command = event.toDustKeyboardCommand()
        if (command != null && keyboardCommands.tryEmit(command)) {
            return true
        }
        return super.onKeyShortcut(keyCode, event)
    }

    override fun onProvideKeyboardShortcuts(
        data: MutableList<KeyboardShortcutGroup>,
        menu: Menu?,
        deviceId: Int,
    ) {
        super.onProvideKeyboardShortcuts(data, menu, deviceId)
        data += KeyboardShortcutGroup(
            "Dust",
            listOf(
                KeyboardShortcutInfo("New conversation", KeyEvent.KEYCODE_N, KeyEvent.META_CTRL_ON),
                KeyboardShortcutInfo("Search conversations", KeyEvent.KEYCODE_K, KeyEvent.META_CTRL_ON),
                KeyboardShortcutInfo(
                    "Catch up",
                    KeyEvent.KEYCODE_U,
                    KeyEvent.META_CTRL_ON or KeyEvent.META_SHIFT_ON,
                ),
            ),
        )
    }

    private fun handleIntent(intent: Intent?) {
        intent?.toIncomingShare()?.let { share ->
            activityState.setShare(share)
            return
        }
        val uri: Uri = intent?.data ?: return
        activityState.setDeepLink(uri.toString())
    }

    private fun openUrl(url: String) {
        val uri = url.toUri()
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        customTabsIntent.launchUrl(this, uri)
    }
}

internal class MainActivityState : ViewModel() {
    private val _pendingDeepLink = MutableStateFlow<String?>(null)
    val pendingDeepLink: StateFlow<String?> = _pendingDeepLink.asStateFlow()

    private val _pendingShare = MutableStateFlow<IncomingShare?>(null)
    val pendingShare: StateFlow<IncomingShare?> = _pendingShare.asStateFlow()

    var initialIntentHandled: Boolean = false
        private set

    fun markInitialIntentHandled() {
        initialIntentHandled = true
    }

    fun setDeepLink(url: String) {
        _pendingDeepLink.value = url
    }

    fun clearDeepLink() {
        _pendingDeepLink.value = null
    }

    fun setShare(share: IncomingShare) {
        _pendingShare.value = share
    }

    fun clearShare() {
        _pendingShare.value = null
    }
}

private fun KeyEvent.toDustKeyboardCommand(): AppKeyboardCommand? {
    if (action != KeyEvent.ACTION_DOWN || repeatCount != 0 || !isCtrlPressed || isAltPressed) return null
    return when {
        keyCode == KeyEvent.KEYCODE_N && !isShiftPressed -> AppKeyboardCommand.NEW_CONVERSATION
        keyCode == KeyEvent.KEYCODE_K && !isShiftPressed -> AppKeyboardCommand.SEARCH_CONVERSATIONS
        keyCode == KeyEvent.KEYCODE_U && isShiftPressed -> AppKeyboardCommand.CATCH_UP
        else -> null
    }
}
