package com.dust.mobile.android.notifications

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import com.dust.mobile.android.R

internal fun DustNotificationPayload.buildNotificationActions(
    context: Context,
    reviewIntent: PendingIntent,
): List<NotificationCompat.Action> = actionKinds.map { kind ->
    when (kind) {
        NotificationActionKind.REPLY -> replyAction(context)
        NotificationActionKind.REVIEW -> NotificationCompat.Action.Builder(
            R.drawable.ic_open_in_browser_24,
            "Review",
            reviewIntent,
        )
            .setShowsUserInterface(true)
            .build()
    }
}

private fun DustNotificationPayload.replyAction(context: Context): NotificationCompat.Action {
    val intent = Intent(context, NotificationActionReceiver::class.java).apply {
        action = NotificationActionReceiver.ACTION_REPLY
        putExtra(NotificationActionReceiver.EXTRA_WORKSPACE_ID, workspaceId)
        putExtra(NotificationActionReceiver.EXTRA_CONVERSATION_ID, conversationId)
    }
    val pendingIntent = PendingIntent.getBroadcast(
        context,
        "$workspaceId:$conversationId:reply".hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
    val remoteInput = RemoteInput.Builder(NotificationActionReceiver.KEY_REPLY_TEXT)
        .setLabel("Reply")
        .build()
    return NotificationCompat.Action.Builder(R.drawable.ic_send_24, "Reply", pendingIntent)
        .addRemoteInput(remoteInput)
        .setAllowGeneratedReplies(true)
        .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
        .setShowsUserInterface(false)
        .build()
}
