package com.dust.mobile.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class LocalPreviewConversationTitleTest {
    @Test
    fun `local preview quick starts use compact conversation titles`() {
        assertEquals("Briefing", localPreviewConversationTitle("Draft customer brief"))
        assertEquals("Workspace summary", localPreviewConversationTitle("Summarize updates"))
        assertEquals("Briefing", localPreviewConversationTitle("Can you help with \"Customer briefing\"?"))
    }

    @Test
    fun `local preview custom prompts keep the user title fallback`() {
        assertEquals("Custom follow-up", localPreviewConversationTitle("Custom follow-up"))
        assertEquals("Customer briefing", localPreviewConversationTitle("   "))
    }
}
