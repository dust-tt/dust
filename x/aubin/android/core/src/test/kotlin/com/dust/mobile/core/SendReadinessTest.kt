package com.dust.mobile.core

import com.dust.mobile.core.model.canSendMessage
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SendReadinessTest {
    @Test
    fun `can send with text`() {
        assertTrue(canSendMessage(text = "hello", hasAttachments = false))
    }

    @Test
    fun `can send with attachments only`() {
        assertTrue(canSendMessage(text = "   ", hasAttachments = true))
    }

    @Test
    fun `can send with a skill reference only`() {
        assertTrue(canSendMessage(text = "", hasAttachments = false, hasSkillReferences = true))
    }

    @Test
    fun `cannot send with knowledge only`() {
        assertFalse(canSendMessage(text = "", hasAttachments = false))
    }

    @Test
    fun `cannot send empty message`() {
        assertFalse(canSendMessage(text = " ", hasAttachments = false))
    }

    @Test
    fun `cannot send while already sending`() {
        assertFalse(canSendMessage(text = "hello", hasAttachments = false, isSending = true))
    }

    @Test
    fun `cannot send when an upload failed`() {
        assertFalse(canSendMessage(text = "hello", hasAttachments = false, hasFailedUploads = true))
    }
}
