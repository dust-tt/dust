package com.dust.mobile.core

import com.dust.mobile.core.model.AgentMentionQuery
import com.dust.mobile.core.model.activeAgentMentionQuery
import com.dust.mobile.core.model.removeActiveAgentMentionQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AgentMentionTriggersTest {
    @Test
    fun `finds an active standalone mention query`() {
        assertEquals(AgentMentionQuery(startIndex = 0, query = ""), activeAgentMentionQuery("@"))
        assertEquals(AgentMentionQuery(startIndex = 4, query = "du"), activeAgentMentionQuery("ask @du"))
        assertEquals(AgentMentionQuery(startIndex = 4, query = "dust"), activeAgentMentionQuery("ask\n@dust"))
    }

    @Test
    fun `ignores embedded and completed mention queries`() {
        assertNull(activeAgentMentionQuery("ada@dust.tt"))
        assertNull(activeAgentMentionQuery("ask @dust please"))
        assertNull(activeAgentMentionQuery("ask"))
    }

    @Test
    fun `removes the active mention query after selection`() {
        assertEquals("ask ", removeActiveAgentMentionQuery("ask @dust"))
        assertEquals("ada@dust.tt", removeActiveAgentMentionQuery("ada@dust.tt"))
    }
}
