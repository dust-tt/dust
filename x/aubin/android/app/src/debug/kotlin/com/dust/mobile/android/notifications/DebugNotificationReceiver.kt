package com.dust.mobile.android.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class DebugNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val isAction = intent.getBooleanExtra(EXTRA_ACTION_REQUIRED, false)
        val isAgent = intent.getBooleanExtra(EXTRA_AGENT, true)
        val payload = DustNotificationPayload(
            type = if (isAction) {
                DustNotificationType.MANUAL_ACTION_REQUIRED
            } else {
                DustNotificationType.CONVERSATION_UNREAD
            },
            workspaceId = intent.getStringExtra(EXTRA_WORKSPACE_ID) ?: "debug-workspace",
            conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: "debug-conversation",
            messageId = intent.getStringExtra(EXTRA_MESSAGE_ID) ?: "debug-message",
            actionId = if (isAction) "debug-action" else null,
            conversationTitle = intent.getStringExtra(EXTRA_CONVERSATION_TITLE) ?: "Android notification preview",
            authorName = if (isAction) null else if (isAgent) "@dust" else "Ada Lovelace",
            authorIsAgent = isAgent,
            isMention = intent.getBooleanExtra(EXTRA_MENTION, false),
            title = when {
                isAction -> "Action required"
                isAgent -> "@dust"
                else -> "Android notification preview"
            },
            body = when {
                isAction -> "An agent action is waiting for your approval."
                isAgent -> "The customer briefing is ready for review."
                else -> "Can you review the latest changes?"
            },
            sentAtMillis = System.currentTimeMillis(),
            authorUserId = if (!isAction && !isAgent) "debug-user" else null,
        )
        NotificationRenderer(context).show(payload)
        resultCode = RESULT_POSTED
    }

    private companion object {
        const val RESULT_POSTED = 1
        const val EXTRA_WORKSPACE_ID = "workspace_id"
        const val EXTRA_CONVERSATION_ID = "conversation_id"
        const val EXTRA_MESSAGE_ID = "message_id"
        const val EXTRA_CONVERSATION_TITLE = "conversation_title"
        const val EXTRA_ACTION_REQUIRED = "action_required"
        const val EXTRA_AGENT = "agent"
        const val EXTRA_MENTION = "mention"
    }
}
