package com.dust.mobile.android.notifications

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

internal data class NotificationPermissionController(
    val isAvailable: Boolean,
    val areNotificationsEnabled: Boolean,
    val manage: () -> Unit,
)

@Composable
internal fun rememberNotificationPermissionController(isAvailable: Boolean): NotificationPermissionController {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val preferences = remember(context) {
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    }
    var areNotificationsEnabled by remember {
        mutableStateOf(context.areDustNotificationsEnabled())
    }
    val refresh = { areNotificationsEnabled = context.areDustNotificationsEnabled() }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        refresh()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    return NotificationPermissionController(
        isAvailable = isAvailable,
        areNotificationsEnabled = areNotificationsEnabled,
        manage = {
            if (!isAvailable) return@NotificationPermissionController

            val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            if (permissionGranted) {
                context.openNotificationSettings()
            } else {
                val requestedBefore = preferences.getBoolean(KEY_PERMISSION_REQUESTED, false)
                val activity = context as? Activity
                val shouldAskAgain = activity?.let {
                    ActivityCompat.shouldShowRequestPermissionRationale(
                        it,
                        Manifest.permission.POST_NOTIFICATIONS,
                    )
                } == true
                if (!requestedBefore || shouldAskAgain) {
                    preferences.edit().putBoolean(KEY_PERMISSION_REQUESTED, true).apply()
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    context.openNotificationSettings()
                }
            }
        },
    )
}

private fun Context.areDustNotificationsEnabled(): Boolean {
    val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    return permissionGranted && NotificationManagerCompat.from(this).areNotificationsEnabled()
}

private fun Context.openNotificationSettings() {
    startActivity(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        },
    )
}

private const val PREFERENCES_NAME = "dust_notifications"
private const val KEY_PERMISSION_REQUESTED = "permission_requested"
