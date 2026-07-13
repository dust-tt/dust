package com.dust.mobile.core

import com.dust.mobile.core.model.removeTrailingAgentPickerTrigger
import com.dust.mobile.core.model.shouldOpenAgentPicker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentMentionTriggersTest {
    @Test
    fun `opens agent picker after standalone at sign`() {
        assertTrue(shouldOpenAgentPicker("@"))
        assertTrue(shouldOpenAgentPicker("ask @"))
        assertTrue(shouldOpenAgentPicker("ask\n@"))
    }

    @Test
    fun `does not open agent picker for embedded at sign`() {
        assertFalse(shouldOpenAgentPicker("ada@dust.tt"))
        assertFalse(shouldOpenAgentPicker("ask @dust"))
        assertFalse(shouldOpenAgentPicker("ask"))
    }

    @Test
    fun `removes only standalone trailing at sign`() {
        assertEquals("ask ", removeTrailingAgentPickerTrigger("ask @"))
        assertEquals("ada@dust.tt", removeTrailingAgentPickerTrigger("ada@dust.tt"))
    }
}
