package com.dust.mobile.core

import com.dust.mobile.core.model.Space
import com.dust.mobile.core.model.visibilityLabel
import org.junit.Assert.assertEquals
import org.junit.Test

class SpaceDisplayTest {
    @Test
    fun `visibility label distinguishes open and closed spaces`() {
        assertEquals(
            "Open",
            Space(sId = "s1", name = "General", kind = "regular", isRestricted = false).visibilityLabel(),
        )
        assertEquals(
            "Closed",
            Space(sId = "s2", name = "Leadership", kind = "regular", isRestricted = true).visibilityLabel(),
        )
    }
}
