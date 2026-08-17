package com.dust.mobile.android.notifications

import android.content.Context
import android.util.Log
import com.dust.mobile.android.BuildConfig
import com.dust.mobile.android.auth.AndroidTokenStore
import com.dust.mobile.core.auth.AuthService
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.repository.MobileNotificationRepository
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PushRegistrationManager(
    context: Context,
    private val repository: MobileNotificationRepository,
    private val tokenStore: AndroidTokenStore,
    private val authService: AuthService,
) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val isConfigured: Boolean
        get() = BuildConfig.FIREBASE_CONFIGURED && FirebaseApp.getApps(appContext).isNotEmpty()

    init {
        if (isConfigured && tokenStore.loadTokens() == null) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
        }
    }

    suspend fun registerForSession(tokenProvider: TokenProvider) {
        if (!isConfigured) return
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        val token = currentToken()
        repository.register(token, tokenProvider)
        saveRegisteredToken(token)
    }

    suspend fun unregisterForSession(tokenProvider: TokenProvider) {
        val token = prefs.getString(KEY_REGISTERED_TOKEN, null)
        try {
            if (token != null) {
                repository.unregister(token, tokenProvider)
            }
        } finally {
            invalidateLocalRegistration()
        }
    }

    @Suppress("DEPRECATION")
    fun invalidateLocalRegistration() {
        prefs.edit().remove(KEY_REGISTERED_TOKEN).apply()
        if (!isConfigured) return

        FirebaseMessaging.getInstance().apply {
            isAutoInitEnabled = false
            deleteToken().addOnFailureListener { error ->
                Log.w(TAG, "Failed to delete the local FCM registration token", error)
            }
        }
    }

    fun onNewToken(token: String) {
        if (!isConfigured) return
        val previousToken = prefs.getString(KEY_REGISTERED_TOKEN, null)
        val authTokens = tokenStore.loadTokens() ?: return
        val tokenProvider = TokenProvider(
            accessToken = authTokens.accessToken,
            refreshToken = authTokens.refreshToken,
            authApi = authService,
            tokenStore = tokenStore,
        )
        scope.launch {
            runCatching {
                if (previousToken != null && previousToken != token) {
                    repository.unregister(previousToken, tokenProvider)
                }
                repository.register(token, tokenProvider)
                saveRegisteredToken(token)
            }.onFailure { error ->
                Log.w(TAG, "Failed to update the mobile notification registration", error)
            }
        }
    }

    // Novu's FCM credential API currently requires a Firebase registration token.
    @Suppress("DEPRECATION")
    private suspend fun currentToken(): String = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            when {
                task.isSuccessful && task.result != null -> continuation.resume(task.result)
                else -> continuation.resumeWithException(
                    task.exception ?: IllegalStateException("FCM did not return a registration token"),
                )
            }
        }
    }

    private fun saveRegisteredToken(token: String) {
        prefs.edit().putString(KEY_REGISTERED_TOKEN, token).apply()
    }

    private companion object {
        const val TAG = "DustPushRegistration"
        const val PREFS_NAME = "dust_notifications"
        const val KEY_REGISTERED_TOKEN = "registered_token"
    }
}
