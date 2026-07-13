package com.dust.mobile.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatchUpStateTest {
    @Test
    fun `flush starts once when marked ids exist`() {
        val state = CatchUpState(
            conversations = emptyList(),
            markedAsReadIds = setOf("c1"),
        )

        val flushing = state.flushStarted()

        assertTrue(state.canStartFlush())
        assertTrue(flushing.isFlushing)
        assertTrue(flushing.hasFlushed)
        assertFalse(flushing.canStartFlush())
    }

    @Test
    fun `flush does not start without ids or while already flushed`() {
        assertFalse(CatchUpState(conversations = emptyList()).canStartFlush())
        assertFalse(
            CatchUpState(
                conversations = emptyList(),
                markedAsReadIds = setOf("c1"),
                isFlushing = true,
            ).canStartFlush(),
        )
        assertFalse(
            CatchUpState(
                conversations = emptyList(),
                markedAsReadIds = setOf("c1"),
                hasFlushed = true,
            ).canStartFlush(),
        )
    }

    @Test
    fun `failed flush clears guard so it can be retried`() {
        val failed = CatchUpState(
            conversations = emptyList(),
            markedAsReadIds = setOf("c1"),
            isFlushing = true,
            hasFlushed = true,
        ).flushFailed("network failed")

        assertFalse(failed.isFlushing)
        assertFalse(failed.hasFlushed)
        assertEquals("network failed", failed.error)
        assertTrue(failed.canStartFlush())
    }
}
