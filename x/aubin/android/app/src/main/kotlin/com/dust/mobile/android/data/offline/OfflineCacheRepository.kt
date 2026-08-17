package com.dust.mobile.android.data.offline

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.DustUser
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.User

internal class OfflineCacheRepository(
    private val store: OfflineCacheStore,
    private val nowEpochMillis: () -> Long = System::currentTimeMillis,
) {
    suspend fun cachedAuthenticatedUser(): User? = store.current().activeUser

    suspend fun activateUser(user: User) {
        store.update { it.forActiveUser(user) }
    }

    suspend fun cachedDustUser(userId: String): DustUser? =
        store.current().takeIf { it.activeUser?.id == userId }?.dustUser

    suspend fun cacheDustUser(activeUser: User, user: DustUser) {
        store.update { it.withDustUser(activeUser, user) }
    }

    suspend fun cachedWorkspace(userId: String, workspaceId: String): CachedWorkspace? =
        store.current()
            .takeIf { it.activeUser?.id == userId }
            ?.workspaces
            ?.find { it.workspaceId == workspaceId }

    suspend fun cacheWorkspace(
        activeUser: User,
        workspaceId: String,
        conversations: List<Conversation>,
        pods: List<Space>,
    ) {
        store.update {
            it.withWorkspace(
                activeUser = activeUser,
                workspaceId = workspaceId,
                conversations = conversations,
                pods = pods,
                updatedAtEpochMillis = nowEpochMillis(),
            )
        }
    }

    suspend fun cachedConversation(
        userId: String,
        workspaceId: String,
        conversationId: String,
    ): CachedConversation? = store.current()
        .takeIf { it.activeUser?.id == userId }
        ?.conversations
        ?.find { it.workspaceId == workspaceId && it.conversationId == conversationId }

    suspend fun cacheConversation(
        activeUser: User,
        workspaceId: String,
        conversationId: String,
        messages: List<ConversationMessage>,
        hasMore: Boolean,
    ) {
        store.update {
            it.withConversation(
                activeUser = activeUser,
                workspaceId = workspaceId,
                conversationId = conversationId,
                messages = messages,
                hasMore = hasMore,
                updatedAtEpochMillis = nowEpochMillis(),
            )
        }
    }

    suspend fun removeConversation(activeUser: User, workspaceId: String, conversationId: String) {
        store.update { it.withoutConversation(activeUser, workspaceId, conversationId) }
    }

    suspend fun clear() = store.clear()
}
