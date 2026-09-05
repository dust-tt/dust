package com.dust.mobile.android.ui.inbox

import com.dust.mobile.core.model.Conversation
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CatchUpViewModelTest {
    @Before
    fun setUp() { Dispatchers.setMain(StandardTestDispatcher()) }

    @After
    fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `dismiss waits for saving and ignores repeated taps`() = runTest {
        val saved = CompletableDeferred<Unit>()
        var calls = 0
        var dismissed: Set<String>? = null
        val viewModel = viewModel { calls++; saved.await() }
        viewModel.markAsRead()

        viewModel.dismiss { dismissed = it }
        viewModel.dismiss { dismissed = it }
        runCurrent()
        assertTrue(viewModel.state.value.isFlushing)
        assertNull(dismissed)
        assertEquals(1, calls)

        saved.complete(Unit)
        runCurrent()
        assertEquals(setOf("first"), dismissed)
        assertTrue(viewModel.state.value.hasFlushed)
        assertFalse(viewModel.state.value.isFlushing)
    }

    @Test
    fun `failed save keeps the review open and retries the same choices`() = runTest {
        var shouldFail = true
        val requests = mutableListOf<Set<String>>()
        var dismissed: Set<String>? = null
        val viewModel = viewModel { ids ->
            requests += ids
            if (shouldFail) throw IOException("offline")
        }
        viewModel.markAsRead()
        viewModel.dismiss { dismissed = it }
        runCurrent()
        assertNull(dismissed)
        assertNotNull(viewModel.state.value.saveError)
        assertEquals(setOf("first"), viewModel.state.value.markedAsReadIds)

        shouldFail = false
        viewModel.dismiss { dismissed = it }
        runCurrent()
        assertEquals(listOf(setOf("first"), setOf("first")), requests)
        assertEquals(setOf("first"), dismissed)
    }

    @Test
    fun `undo restores read and skipped cards without saving`() = runTest {
        var saves = 0
        val viewModel = viewModel { saves++ }
        viewModel.markAsRead()
        viewModel.keepForLater()
        assertTrue(viewModel.state.value.isDone)
        assertEquals(1, viewModel.state.value.keptForLaterCount)

        viewModel.undoLastReview()
        assertEquals("second", viewModel.state.value.currentConversation?.sId)
        viewModel.undoLastReview()
        assertEquals("first", viewModel.state.value.currentConversation?.sId)
        assertTrue(viewModel.state.value.markedAsReadIds.isEmpty())
        runCurrent()
        assertEquals(0, saves)
    }

    @Test
    fun `returning from an attachment preserves progress but reopening starts a new review`() = runTest {
        val viewModel = viewModel {}
        val conversations = viewModel.state.value.conversations
        viewModel.startSession("review-one", conversations)
        viewModel.keepForLater()
        viewModel.startSession("review-one", conversations)
        assertEquals(1, viewModel.state.value.currentIndex)

        viewModel.startSession("review-two", conversations)
        assertEquals(0, viewModel.state.value.currentIndex)
        assertFalse(viewModel.state.value.isDone)
    }

    private fun viewModel(save: suspend (Set<String>) -> Unit) = CatchUpViewModel(
        conversations = listOf("first", "second").map { id ->
            Conversation(sId = id, created = 1.0, updated = 1.0, unread = true, actionRequired = false)
        },
        fetchMessages = { emptyList() },
        saveReadStatus = save,
    )
}
