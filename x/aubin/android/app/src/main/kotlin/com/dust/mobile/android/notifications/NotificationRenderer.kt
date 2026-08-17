package com.dust.mobile.android.notifications

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import com.dust.mobile.android.MainActivity
import com.dust.mobile.android.R

internal class NotificationRenderer(
    private val context: Context,
) {
    private val manager = NotificationManagerCompat.from(context)
    private val conversationShortcuts = ConversationNotificationShortcutPublisher(context)

    fun show(payload: DustNotificationPayload) {
        if (!canPostNotifications() || NotificationPresentationState.shouldSuppress(payload.conversationId)) {
            return
        }

        val contentIntent = PendingIntent.getActivity(
            context,
            payload.deepLinkRequestCode(),
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = payload.deepLink(CALLBACK_SCHEME).toUri()
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val channelId = NotificationChannels.forPayload(payload)
        val conversationShortcutId = conversationShortcuts.publish(payload)
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_dust)
            .setColor(ContextCompat.getColor(context, R.color.dust_notification_accent))
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setWhen(payload.sentAtMillis)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setOnlyAlertOnce(
                payload.type == DustNotificationType.CONVERSATION_UNREAD && !payload.isMention,
            )
            .setContentIntent(contentIntent)
            .setCategory(
                if (payload.type == DustNotificationType.MANUAL_ACTION_REQUIRED) {
                    NotificationCompat.CATEGORY_REMINDER
                } else {
                    NotificationCompat.CATEGORY_MESSAGE
                },
            )
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(channelId))
            .setGroup("dust_workspace_${payload.workspaceId}")
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)

        conversationShortcutId?.let(builder::setShortcutId)
        payload.buildNotificationActions(context, contentIntent).forEach { action ->
            builder.addAction(action)
        }

        if (payload.usesHumanConversationSemantics) {
            val sender = Person.Builder()
                .setName(payload.authorName ?: payload.title)
                .setKey(requireNotNull(payload.authorUserId))
                .setImportant(payload.isMention)
                .setBot(false)
                .build()
            val currentUser = Person.Builder()
                .setName("You")
                .setKey("dust_current_user")
                .build()
            builder.setStyle(
                NotificationCompat.MessagingStyle(currentUser)
                    .setConversationTitle(payload.conversationTitle)
                    .setGroupConversation(true)
                    .addMessage(payload.body, payload.sentAtMillis, sender),
            )
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(payload.body))
        }

        manager.notify(payload.conversationId, NOTIFICATION_ID, builder.build())
    }

    fun cancelConversation(conversationId: String) {
        manager.cancel(conversationId, NOTIFICATION_ID)
    }

    private fun canPostNotifications(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED && manager.areNotificationsEnabled()

    private fun publicVersion(channelId: String): Notification =
        NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_dust)
            .setContentTitle("Dust")
            .setContentText("New activity")
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

    private fun DustNotificationPayload.deepLinkRequestCode(): Int =
        "$workspaceId:$conversationId".hashCode()

    private companion object {
        const val CALLBACK_SCHEME = "dust"
        const val NOTIFICATION_ID = 100
    }
}
