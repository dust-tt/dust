package com.dust.mobile.android.data.offline

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User
import kotlinx.serialization.Serializable

@Serializable
internal data class OfflineCacheState(
    val activeUser: User? = null,
    val dustUser: DustUser? = null,
    val workspaces: List<CachedWorkspace> = emptyList(),
    val conversations: List<CachedConversation> = emptyList(),
)

@Serializable
internal data class CachedWorkspace(
    val workspaceId: String,
    val conversations: List<Conversation>,
    val pods: List<Space>,
    val updatedAtEpochMillis: Long,
)

@Serializable
internal data class CachedConversation(
    val workspaceId: String,
    val conversationId: String,
    val messages: List<ConversationMessage>,
    val hasMore: Boolean,
    val lastValue: Int? = null,
    val updatedAtEpochMillis: Long,
)

internal fun OfflineCacheState.forActiveUser(user: User): OfflineCacheState =
    if (activeUser?.id == user.id) {
        copy(activeUser = user)
    } else {
        OfflineCacheState(activeUser = user)
    }

internal fun OfflineCacheState.withDustUser(activeUser: User, user: DustUser): OfflineCacheState =
    forActiveUser(activeUser).copy(dustUser = user)

internal fun OfflineCacheState.withWorkspace(
    activeUser: User,
    workspaceId: String,
    conversations: List<Conversation>,
    pods: List<Space>,
    updatedAtEpochMillis: Long,
): OfflineCacheState {
    val current = forActiveUser(activeUser)
    val snapshot = CachedWorkspace(
        workspaceId = workspaceId,
        conversations = conversations.take(MAX_CACHED_CONVERSATIONS_PER_WORKSPACE),
        pods = pods.take(MAX_CACHED_PODS_PER_WORKSPACE),
        updatedAtEpochMillis = updatedAtEpochMillis,
    )
    return current.copy(
        workspaces = (current.workspaces.filterNot { it.workspaceId == workspaceId } + snapshot)
            .sortedByDescending(CachedWorkspace::updatedAtEpochMillis)
            .take(MAX_CACHED_WORKSPACES),
    )
}

internal fun OfflineCacheState.withConversation(
    activeUser: User,
    workspaceId: String,
    conversationId: String,
    messages: List<ConversationMessage>,
    hasMore: Boolean,
    updatedAtEpochMillis: Long,
): OfflineCacheState {
    val current = forActiveUser(activeUser)
    val sortedMessages = messages.sortedBy { it.rank }
    val boundedMessages = sortedMessages.takeLast(MAX_CACHED_MESSAGES_PER_CONVERSATION)
    val omittedMessages = boundedMessages.size < sortedMessages.size
    val cachedHasMore = hasMore || omittedMessages
    val snapshot = CachedConversation(
        workspaceId = workspaceId,
        conversationId = conversationId,
        messages = boundedMessages,
        hasMore = cachedHasMore,
        lastValue = boundedMessages.minOfOrNull { it.rank }.takeIf { cachedHasMore },
        updatedAtEpochMillis = updatedAtEpochMillis,
    )
    return current.copy(
        conversations = (
            current.conversations.filterNot {
                it.workspaceId == workspaceId && it.conversationId == conversationId
            } + snapshot
        )
            .sortedByDescending(CachedConversation::updatedAtEpochMillis)
            .take(MAX_CACHED_MESSAGE_TIMELINES),
    )
}

internal fun OfflineCacheState.withoutConversation(
    activeUser: User,
    workspaceId: String,
    conversationId: String,
): OfflineCacheState {
    val current = forActiveUser(activeUser)
    return current.copy(
        conversations = current.conversations.filterNot {
            it.workspaceId == workspaceId && it.conversationId == conversationId
        },
    )
}

private const val MAX_CACHED_WORKSPACES = 4
private const val MAX_CACHED_CONVERSATIONS_PER_WORKSPACE = 100
private const val MAX_CACHED_PODS_PER_WORKSPACE = 100
private const val MAX_CACHED_MESSAGE_TIMELINES = 12
private const val MAX_CACHED_MESSAGES_PER_CONVERSATION = 40
