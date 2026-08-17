package com.dust.mobile.android.ui.common

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AvatarInitialTest {
    @Test
    fun `avatarInitial skips mention punctuation`() {
        assertEquals("S", avatarInitial("@sales"))
        assertEquals("C", avatarInitial("#customer"))
    }

    @Test
    fun `avatarInitial falls back for blank names`() {
        assertEquals("U", avatarInitial(null))
        assertEquals("U", avatarInitial("  "))
    }

    @Test
    fun `avatar identity requires a name or image`() {
        assertFalse(hasAvatarIdentity(null, null))
        assertFalse(hasAvatarIdentity("  ", " "))
        assertTrue(hasAvatarIdentity("Lea Martin", null))
        assertTrue(hasAvatarIdentity(null, "https://example.com/avatar.png"))
    }
}
