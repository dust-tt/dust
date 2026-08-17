package com.dust.mobile.android.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import com.dust.mobile.android.DustApplication
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_REPLY) return
        val replyText = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(KEY_REPLY_TEXT)
            ?.toString()
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return
        val workspaceId = intent.getStringExtra(EXTRA_WORKSPACE_ID)?.takeIf(String::isNotBlank) ?: return
        val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)?.takeIf(String::isNotBlank) ?: return
        val pendingResult = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val graph = (appContext as DustApplication).graph
                if (graph.tokenStore.loadTokens() == null) return@launch
                val requestId = UUID.randomUUID().toString()
                graph.outboxRepository.enqueue(
                    PersistedOutboxItem(
                        id = requestId,
                        kind = PersistedOutboxKind.NOTIFICATION_REPLY,
                        workspaceId = workspaceId,
                        conversationId = conversationId,
                        notificationReplyText = replyText,
                        displayText = replyText,
                        createdAtEpochMillis = System.currentTimeMillis(),
                    ),
                )
                NotificationRenderer(appContext).cancelConversation(conversationId)
            } finally {
                pendingResult.finish()
            }
        }
    }

    internal companion object {
        const val ACTION_REPLY = "com.dust.mobile.action.REPLY"
        const val KEY_REPLY_TEXT = "com.dust.mobile.extra.REPLY_TEXT"
        const val EXTRA_WORKSPACE_ID = "com.dust.mobile.extra.WORKSPACE_ID"
        const val EXTRA_CONVERSATION_ID = "com.dust.mobile.extra.CONVERSATION_ID"
    }
}
