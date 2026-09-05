package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.ConversationListData
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.Workspace
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationDiscoveryControllerTest {
    @Test
    fun `search finds conversations outside the inbox page and ignores superseded results`() = runTest {
        val oldResponse = CompletableDeferred<ConversationsResponse>()
        val state = MutableStateFlow(initialState())
        val controller = ConversationDiscoveryController(
            state = state,
            scope = backgroundScope,
            fetchPage = { _, _ -> error("Not used") },
            searchConversations = { _, query, _ ->
                if (query == "old") withContext(NonCancellable) { oldResponse.await() }
                else ConversationsResponse(listOf(conversation("archived", title = "New match")), false)
            },
        )
        controller.updateSearch("old")
        advanceTimeBy(251)
        runCurrent()
        controller.updateSearch("new")
        advanceTimeBy(251)
        runCurrent()
        oldResponse.complete(ConversationsResponse(listOf(conversation("outdated")), false))
        runCurrent()

        assertEquals(listOf("archived"), state.value.groupedConversations.single().conversations.map { it.sId })
        assertEquals(listOf("recent"), state.value.conversations.map { it.sId })
    }

    @Test
    fun `failed search keeps recent matches visible and retries without losing the query`() = runTest {
        val state = MutableStateFlow(initialState())
        var fail = true
        val controller = ConversationDiscoveryController(
            state, backgroundScope,
            fetchPage = { _, _ -> error("Not used") },
            searchConversations = { _, _, _ ->
                if (fail) throw IOException("offline")
                ConversationsResponse(listOf(conversation("older", title = "Recent planning")), false)
            },
        )
        controller.updateSearch("recent")
        advanceTimeBy(251)
        runCurrent()
        assertNotNull(state.value.search.error)
        assertEquals("recent", state.value.groupedConversations.single().conversations.single().sId)

        fail = false
        controller.retrySearch()
        runCurrent()
        assertEquals("older", state.value.search.results?.single()?.sId)
        controller.updateSearch("")
        assertEquals(listOf("recent"), state.value.groupedConversations.single().conversations.map { it.sId })
    }

    @Test
    fun `pagination retries the same cursor and deduplicates overlaps`() = runTest {
        val state = MutableStateFlow(initialState().copy(hasMore = true, lastValue = "page-one"))
        var fail = true
        val cursors = mutableListOf<String>()
        val controller = ConversationDiscoveryController(
            state, backgroundScope,
            fetchPage = { _, cursor ->
                cursors += cursor
                if (fail) throw IOException("offline")
                ConversationsResponse(listOf(conversation("recent"), conversation("older")), false, "page-two")
            },
            searchConversations = { _, _, _ -> error("Not used") },
        )
        controller.loadMore()
        runCurrent()
        assertNotNull(state.value.loadMoreError)
        assertFalse(state.value.isLoadingMore)
        fail = false
        controller.loadMore()
        runCurrent()
        assertEquals(listOf("page-one", "page-one"), cursors)
        assertEquals(listOf("recent", "older"), state.value.conversations.map { it.sId })
        assertFalse(state.value.hasMore)
    }

    @Test
    fun `refresh preserves loaded history and its continuation cursor`() {
        val state = initialState().copy(
            conversations = listOf(conversation("recent", updated = 300.0), conversation("older", updated = 100.0)),
            hasMore = true,
            hasLoadedMore = true,
            lastValue = "100",
        )
        val refreshed = state.withRefreshDataForWorkspace(
            "workspace",
            ConversationListData(listOf(conversation("recent", updated = 400.0)), emptyList(), true, "400"),
        )
        assertEquals(listOf("recent", "older"), refreshed.conversations.map { it.sId })
        assertEquals("100", refreshed.lastValue)
        assertTrue(refreshed.hasMore)
    }

    private fun initialState() = ConversationListState(
        isLoading = false,
        workspace = Workspace("workspace", "Workspace", "admin"),
        conversations = listOf(conversation("recent", title = "Recent planning")),
    )

    private fun conversation(id: String, title: String = id, updated: Double = 1.0) = Conversation(
        sId = id, created = 1.0, updated = updated, title = title, unread = false, actionRequired = false,
    )
}
