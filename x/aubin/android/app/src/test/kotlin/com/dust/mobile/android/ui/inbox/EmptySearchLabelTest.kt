package com.dust.mobile.android.ui.inbox

import org.junit.Assert.assertEquals
import org.junit.Test

class EmptySearchLabelTest {
    @Test
    fun `conversation list empty label treats only empty search as no search`() {
        assertEquals("No conversations yet", conversationListEmptyLabel(""))
        assertEquals("No results for \" \"", conversationListEmptyLabel(" "))
    }

    @Test
    fun `pod conversation empty label treats only empty search as no search`() {
        assertEquals("No conversations yet", podConversationListEmptyLabel(""))
        assertEquals("No matching conversations", podConversationListEmptyLabel(" "))
    }
}
