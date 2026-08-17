package com.dust.mobile.android.notifications

internal enum class DustNotificationType(val wireValue: String) {
    CONVERSATION_UNREAD("conversation_unread"),
    MANUAL_ACTION_REQUIRED("manual_action_required");

    companion object {
        fun fromWireValue(value: String?): DustNotificationType? = entries.find { it.wireValue == value }
    }
}

internal data class DustNotificationPayload(
    val type: DustNotificationType,
    val workspaceId: String,
    val conversationId: String,
    val messageId: String?,
    val actionId: String?,
    val conversationTitle: String,
    val authorName: String?,
    val authorIsAgent: Boolean,
    val isMention: Boolean,
    val title: String,
    val body: String,
    val sentAtMillis: Long,
    val authorUserId: String? = null,
) {
    val usesHumanConversationSemantics: Boolean
        get() = type == DustNotificationType.CONVERSATION_UNREAD &&
            !authorIsAgent && authorUserId != null

    val actionKinds: List<NotificationActionKind>
        get() = when (type) {
            DustNotificationType.CONVERSATION_UNREAD -> listOf(NotificationActionKind.REPLY)
            DustNotificationType.MANUAL_ACTION_REQUIRED -> listOf(NotificationActionKind.REVIEW)
        }

    fun deepLink(callbackScheme: String): String = buildString {
        append(callbackScheme)
        append("://conversation/")
        append(workspaceId)
        append('/')
        append(conversationId)
        messageId?.let {
            append("?messageId=")
            append(it)
        }
    }

    companion object {
        fun fromData(data: Map<String, String>, sentAtMillis: Long = 0L): DustNotificationPayload? {
            val type = DustNotificationType.fromWireValue(data[KEY_TYPE]) ?: return null
            val workspaceId = data[KEY_WORKSPACE_ID]?.takeIf { it.isNotBlank() } ?: return null
            val conversationId = data[KEY_CONVERSATION_ID]?.takeIf { it.isNotBlank() } ?: return null
            val title = data[KEY_TITLE]?.takeIf { it.isNotBlank() } ?: "Dust"
            val body = data[KEY_BODY]?.takeIf { it.isNotBlank() } ?: return null
            return DustNotificationPayload(
                type = type,
                workspaceId = workspaceId,
                conversationId = conversationId,
                messageId = data[KEY_MESSAGE_ID]?.takeIf { it.isNotBlank() },
                actionId = data[KEY_ACTION_ID]?.takeIf { it.isNotBlank() },
                conversationTitle = data[KEY_CONVERSATION_TITLE]?.takeIf { it.isNotBlank() } ?: title,
                authorName = data[KEY_AUTHOR_NAME]?.takeIf { it.isNotBlank() },
                authorIsAgent = data[KEY_AUTHOR_IS_AGENT].toBoolean(),
                isMention = data[KEY_IS_MENTION].toBoolean(),
                title = title,
                body = body,
                sentAtMillis = sentAtMillis.takeIf { it > 0 } ?: System.currentTimeMillis(),
                authorUserId = data[KEY_AUTHOR_USER_ID]?.takeIf { it.isNotBlank() },
            )
        }

        const val KEY_TYPE = "dust_type"
        const val KEY_WORKSPACE_ID = "dust_workspace_id"
        const val KEY_CONVERSATION_ID = "dust_conversation_id"
        const val KEY_MESSAGE_ID = "dust_message_id"
        const val KEY_ACTION_ID = "dust_action_id"
        const val KEY_CONVERSATION_TITLE = "dust_conversation_title"
        const val KEY_AUTHOR_NAME = "dust_author_name"
        const val KEY_AUTHOR_USER_ID = "dust_author_user_id"
        const val KEY_AUTHOR_IS_AGENT = "dust_author_is_agent"
        const val KEY_IS_MENTION = "dust_is_mention"
        const val KEY_TITLE = "dust_title"
        const val KEY_BODY = "dust_body"
    }
}

internal enum class NotificationActionKind {
    REPLY,
    REVIEW,
}
