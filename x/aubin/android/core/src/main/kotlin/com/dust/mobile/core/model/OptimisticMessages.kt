package com.dust.mobile.core.model

import java.time.Instant
import java.util.UUID

fun optimisticUserMessage(
    content: String,
    user: User,
    messages: List<ConversationMessage>,
    sId: String = "pending-${UUID.randomUUID()}",
    createdEpochMs: Double = Instant.now().toEpochMilli().toDouble(),
): ConversationMessage.User {
    val nextRank = (messages.maxOfOrNull { it.rank } ?: 0) + 1
    return ConversationMessage.User(
        UserMessage(
            id = 0,
            sId = sId,
            type = MessageType.USER,
            created = createdEpochMs,
            visibility = "visible",
            version = 0,
            rank = nextRank,
            content = content,
            user = null,
            context = UserMessageContext(email = user.email),
            contentFragments = null,
        ),
    )
}
