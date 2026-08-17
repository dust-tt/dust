package com.dust.mobile.android.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context

internal object NotificationChannels {
    const val CONVERSATIONS = "dust_conversations_v1"
    const val MENTIONS = "dust_mentions_v1"
    const val ACTIONS = "dust_actions_v1"

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(
                    CONVERSATIONS,
                    "Conversations",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "New replies in Dust conversations"
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                    setShowBadge(true)
                },
                NotificationChannel(
                    MENTIONS,
                    "Mentions",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Messages that mention you"
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                    enableVibration(true)
                    setShowBadge(true)
                },
                NotificationChannel(
                    ACTIONS,
                    "Actions required",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Agent actions waiting for your approval"
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                    enableVibration(true)
                    setShowBadge(true)
                },
            ),
        )
    }

    fun forPayload(payload: DustNotificationPayload): String = when {
        payload.type == DustNotificationType.MANUAL_ACTION_REQUIRED -> ACTIONS
        payload.isMention -> MENTIONS
        else -> CONVERSATIONS
    }
}
