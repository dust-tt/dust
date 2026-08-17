package com.dust.mobile.android.notifications

import android.app.Activity
import android.app.Application
import android.os.Bundle
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

internal object NotificationPresentationState : Application.ActivityLifecycleCallbacks {
    private val startedActivityCount = AtomicInteger(0)
    private val foreground = AtomicBoolean(false)
    private val visibleConversationId = AtomicReference<String?>(null)

    fun register(application: Application) {
        application.registerActivityLifecycleCallbacks(this)
    }

    fun showConversation(conversationId: String?) {
        visibleConversationId.set(conversationId)
    }

    fun shouldSuppress(conversationId: String): Boolean =
        foreground.get() && visibleConversationId.get() == conversationId

    override fun onActivityStarted(activity: Activity) {
        if (startedActivityCount.incrementAndGet() == 1) {
            foreground.set(true)
        }
    }

    override fun onActivityStopped(activity: Activity) {
        if (startedActivityCount.decrementAndGet().coerceAtLeast(0) == 0) {
            startedActivityCount.set(0)
            foreground.set(false)
        }
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
