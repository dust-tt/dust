package com.dust.mobile.android.ui.conversation.detail

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.dust.mobile.android.ui.theme.DustTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ConversationReadingInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun readingLongResponseStaysPutWhenNewMessageArrivesAndCanJumpToLatest() {
        val messageCount = mutableIntStateOf(3)
        lateinit var listState: LazyListState
        lateinit var scope: CoroutineScope
        composeRule.setContent {
            DustTheme {
                listState = rememberLazyListState()
                scope = rememberCoroutineScope()
                ConversationScrollEffects(
                    conversationId = "conversation",
                    messageCount = messageCount.intValue,
                    lastMessageId = "message-${messageCount.intValue}",
                    hasMore = false,
                    hasRefreshError = true,
                    streamingMessageId = null,
                    isComposerFocused = false,
                    isSending = false,
                    listState = listState,
                    onUserScroll = {},
                )
                Box(Modifier.height(360.dp)) {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        item(key = "notice") { Text("Showing saved messages") }
                        items(messageCount.intValue, key = { "message-$it" }) { index ->
                            Text("Long response $index", Modifier.height(800.dp))
                        }
                        item(key = "bottom") { Spacer(Modifier.height(1.dp)) }
                    }
                    ConversationJumpToLatest(listState, Modifier.align(Alignment.BottomCenter))
                }
            }
        }
        composeRule.waitForIdle()
        composeRule.runOnIdle { assertFalse(listState.canScrollForward) }
        composeRule.runOnIdle { scope.launch { listState.scrollToItem(3, 100) } }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Jump to latest").assertExists()

        composeRule.runOnIdle { messageCount.intValue = 4 }
        composeRule.waitForIdle()
        composeRule.runOnIdle {
            assertEquals(3, listState.firstVisibleItemIndex)
            assertEquals(100, listState.firstVisibleItemScrollOffset)
        }
        composeRule.onNodeWithText("Jump to latest").performClick()
        composeRule.waitForIdle()
        composeRule.runOnIdle { assertFalse(listState.canScrollForward) }
        composeRule.onNodeWithText("Jump to latest").assertDoesNotExist()

        composeRule.runOnIdle { messageCount.intValue = 5 }
        composeRule.waitForIdle()
        composeRule.runOnIdle { assertFalse(listState.canScrollForward) }
        composeRule.onNodeWithText("Jump to latest").assertDoesNotExist()
    }
}
