package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Workspace
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListActionsControllerTest {
    @Test
    fun `failed deletion restores only the deleted row and preserves newer changes`() = runTest {
        val deleted = conversation("deleted")
        val response = CompletableDeferred<Unit>()
        val state = MutableStateFlow(initialState(listOf(deleted, conversation("other"))))
        val controller = ConversationListActionsController(
            state, backgroundScope, { _, _, _ -> }, { _, _ -> response.await() }, {}, { _, _ -> },
        )
        controller.deleteConversation(deleted)
        runCurrent()
        controller.updateTitle("other", "New title")
        state.update { it.copy(conversations = it.conversations + conversation("new")) }
        response.completeExceptionally(IOException("offline"))
        runCurrent()

        assertEquals(listOf("deleted", "other", "new"), state.value.conversations.map { it.sId })
        assertEquals("New title", state.value.conversations[1].title)
        assertEquals(listOf("deleted", "other"), state.value.search.results?.map { it.sId })
        assertNotNull(state.value.actionError)
    }

    @Test
    fun `failed action in an old workspace cannot overwrite the selected workspace`() = runTest {
        val item = conversation("item")
        val response = CompletableDeferred<Unit>()
        val state = MutableStateFlow(initialState(listOf(item)))
        val controller = ConversationListActionsController(
            state, backgroundScope, { _, _, _ -> response.await() }, { _, _ -> }, {}, { _, _ -> },
        )
        controller.toggleReadStatus(item)
        runCurrent()
        state.value = initialState(listOf(conversation("new-workspace"))).copy(
            workspace = Workspace("second", "Second", "admin"),
        )
        response.completeExceptionally(IOException("offline"))
        runCurrent()

        assertEquals("new-workspace", state.value.conversations.single().sId)
        assertNull(state.value.actionError)
    }

    @Test
    fun `search-only read actions prevent duplicate requests and preserve renamed titles on failure`() = runTest {
        val item = conversation("remote")
        val response = CompletableDeferred<Unit>()
        var requests = 0
        val state = MutableStateFlow(initialState(emptyList()).copy(
            search = ConversationSearchState(results = listOf(item)),
        ))
        val controller = ConversationListActionsController(
            state, backgroundScope,
            { _, _, _ -> requests++; response.await() }, { _, _ -> }, {}, { _, _ -> },
        )
        controller.toggleReadStatus(item)
        controller.toggleReadStatus(item)
        runCurrent()
        assertEquals(1, requests)
        assertFalse(state.value.search.results!!.single().unread)
        controller.updateTitle("remote", "Renamed")
        response.completeExceptionally(IOException("offline"))
        runCurrent()

        assertTrue(state.value.search.results!!.single().unread)
        assertEquals("Renamed", state.value.search.results!!.single().title)
        assertTrue(state.value.conversations.isEmpty())
    }

    private fun initialState(items: List<Conversation>) = ConversationListState(
        isLoading = false,
        workspace = Workspace("workspace", "Workspace", "admin"),
        conversations = items,
        searchText = "query",
        search = ConversationSearchState(results = items),
    )

    private fun conversation(id: String) = Conversation(
        sId = id, created = 1.0, updated = 1.0, title = id, unread = true, actionRequired = false,
    )
}
