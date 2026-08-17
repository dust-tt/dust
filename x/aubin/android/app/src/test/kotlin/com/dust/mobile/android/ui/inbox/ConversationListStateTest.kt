package com.dust.mobile.android.ui.inbox

import com.dust.mobile.android.ui.conversation.detail.shouldMarkConversationAsReadOnOpen
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.Workspace
import org.junit.Assert.assertEquals
import org.junit.Test

class ConversationListStateTest {
    @Test
    fun `pods are collapsed by default`() {
        assertEquals(false, ConversationListState().isPodsExpanded)
    }

    @Test
    fun `list body only replaces unresolved content`() {
        assertEquals(
            ConversationListBodyState.LOADING,
            ConversationListState(isLoading = true).bodyState,
        )
        assertEquals(
            ConversationListBodyState.ERROR,
            ConversationListState(isLoading = false, error = "Offline").bodyState,
        )

        val staleContent = ConversationListState(
            isLoading = false,
            error = "Refresh failed",
            conversations = listOf(conversation("existing")),
        )

        assertEquals(ConversationListBodyState.CONTENT, staleContent.bodyState)
        assertEquals("Refresh failed", staleContent.refreshError)
    }

    @Test
    fun `refresh data applies to matching workspace`() {
        val data = ConversationListData(
            conversations = listOf(conversation("c1")),
            pods = listOf(space("sp1")),
        )

        val updated = ConversationListState(
            isLoading = true,
            error = "old error",
            workspace = workspace("w1"),
        ).withRefreshDataForWorkspace("w1", data)

        assertEquals(false, updated.isLoading)
        assertEquals(null, updated.error)
        assertEquals(data.conversations, updated.conversations)
        assertEquals(data.pods, updated.pods)
    }

    @Test
    fun `refresh data ignores stale workspace result`() {
        val state = ConversationListState(
            isLoading = true,
            workspace = workspace("w2"),
            conversations = listOf(conversation("existing")),
        )

        val updated = state.withRefreshDataForWorkspace(
            workspaceId = "w1",
            data = ConversationListData(
                conversations = listOf(conversation("stale")),
                pods = listOf(space("stale")),
            ),
        )

        assertEquals(state, updated)
    }

    @Test
    fun `refresh error ignores stale workspace failure`() {
        val state = ConversationListState(
            isLoading = true,
            workspace = workspace("w2"),
            error = null,
        )

        val updated = state.withRefreshErrorForWorkspace("w1", "failed")

        assertEquals(state, updated)
    }

    @Test
    fun `refresh progress is visible only after initial content resolves`() {
        val loading = ConversationListState(isLoading = true, error = "old error").refreshStarted()
        val loaded = ConversationListState(isLoading = false, error = "old error").refreshStarted()

        assertEquals(false, loading.isRefreshing)
        assertEquals(true, loaded.isRefreshing)
        assertEquals(null, loading.error)
        assertEquals(null, loaded.error)
    }

    @Test
    fun `refresh completion clears progress for matching workspace`() {
        val state = ConversationListState(
            isLoading = false,
            isRefreshing = true,
            workspace = workspace("w1"),
        )

        assertEquals(
            false,
            state.withRefreshDataForWorkspace(
                "w1",
                ConversationListData(conversations = emptyList(), pods = emptyList()),
            ).isRefreshing,
        )
        assertEquals(
            false,
            state.withRefreshErrorForWorkspace("w1", "failed").isRefreshing,
        )
    }

    @Test
    fun `conversation detail marks unread and action-required conversations as read on open`() {
        assertEquals(true, shouldMarkConversationAsReadOnOpen(conversation("unread", unread = true)))
        assertEquals(
            true,
            shouldMarkConversationAsReadOnOpen(conversation("action", unread = false, actionRequired = true)),
        )
        assertEquals(false, shouldMarkConversationAsReadOnOpen(conversation("read")))
    }

    @Test
    fun `conversation list prioritizes attention before recent work`() {
        val state = ConversationListState(
            conversations = listOf(
                conversation("unread", unread = true),
                conversation("error", hasError = true),
                conversation("recent"),
            ),
        )

        assertEquals(listOf("Needs you", "Recent"), state.groupedConversations.map { it.label })
        assertEquals(
            listOf("unread", "error"),
            state.groupedConversations.first().conversations.map { it.sId },
        )
        assertEquals(listOf("recent"), state.groupedConversations.last().conversations.map { it.sId })
    }

    private fun workspace(id: String): Workspace =
        Workspace(sId = id, name = "Workspace $id", role = "admin")

    private fun conversation(
        id: String,
        unread: Boolean = false,
        actionRequired: Boolean = false,
        hasError: Boolean = false,
    ): Conversation =
        Conversation(
            sId = id,
            created = 1.0,
            updated = 2.0,
            title = "Conversation $id",
            unread = unread,
            actionRequired = actionRequired,
            hasError = hasError,
        )

    private fun space(id: String): Space =
        Space(sId = id, name = "Space $id", kind = "project")
}
