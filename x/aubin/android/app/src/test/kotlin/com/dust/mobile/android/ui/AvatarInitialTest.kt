package com.dust.mobile.android.ui

import org.junit.Assert.assertEquals
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
}
