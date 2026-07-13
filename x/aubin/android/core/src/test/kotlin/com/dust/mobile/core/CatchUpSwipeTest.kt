package com.dust.mobile.core

import com.dust.mobile.core.model.CatchUpSwipeAction
import com.dust.mobile.core.model.catchUpSwipeAction
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatchUpSwipeTest {
    @Test
    fun `positive swipe past threshold marks as read`() {
        assertEquals(CatchUpSwipeAction.MARK_AS_READ, catchUpSwipeAction(81f, 80f))
    }

    @Test
    fun `negative swipe past threshold keeps for later`() {
        assertEquals(CatchUpSwipeAction.KEEP_FOR_LATER, catchUpSwipeAction(-81f, 80f))
    }

    @Test
    fun `swipes within threshold do not trigger an action`() {
        assertNull(catchUpSwipeAction(80f, 80f))
        assertNull(catchUpSwipeAction(-80f, 80f))
        assertNull(catchUpSwipeAction(0f, 80f))
    }
}
