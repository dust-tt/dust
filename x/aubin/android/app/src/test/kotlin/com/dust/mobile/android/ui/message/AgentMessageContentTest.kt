package com.dust.mobile.android.ui.message

import org.junit.Assert.assertEquals
import org.junit.Test

class AgentMessageContentTest {
    @Test
    fun `agent handle is normalized for display`() {
        assertEquals("@Dust", agentHandle("Dust"))
        assertEquals("@Dust", agentHandle(" @Dust "))
        assertEquals("@Agent", agentHandle(" "))
    }
}
