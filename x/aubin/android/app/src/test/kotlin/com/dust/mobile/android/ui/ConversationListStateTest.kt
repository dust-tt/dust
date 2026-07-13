package com.dust.mobile.android.ui

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.Workspace
import org.junit.Assert.assertEquals
import org.junit.Test

class ConversationListStateTest {
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
    fun `conversation detail marks unread and action-required conversations as read on open`() {
        assertEquals(true, shouldMarkConversationAsReadOnOpen(conversation("unread", unread = true)))
        assertEquals(
            true,
            shouldMarkConversationAsReadOnOpen(conversation("action", unread = false, actionRequired = true)),
        )
        assertEquals(false, shouldMarkConversationAsReadOnOpen(conversation("read")))
    }

    private fun workspace(id: String): Workspace =
        Workspace(sId = id, name = "Workspace $id", role = "admin")

    private fun conversation(
        id: String,
        unread: Boolean = false,
        actionRequired: Boolean = false,
    ): Conversation =
        Conversation(
            sId = id,
            created = 1.0,
            updated = 2.0,
            title = "Conversation $id",
            unread = unread,
            actionRequired = actionRequired,
        )

    private fun space(id: String): Space =
        Space(sId = id, name = "Space $id", kind = "project")
}
