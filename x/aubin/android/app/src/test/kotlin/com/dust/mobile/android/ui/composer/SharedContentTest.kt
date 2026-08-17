package com.dust.mobile.android.ui.composer

import org.junit.Assert.assertEquals
import org.junit.Test

class SharedContentTest {
    @Test
    fun `shared text initializes an empty draft`() {
        assertEquals("Shared text", appendSharedText("", "  Shared text  "))
    }

    @Test
    fun `shared text is appended to an existing draft`() {
        assertEquals(
            "Existing draft\n\nShared text",
            appendSharedText("Existing draft  ", "Shared text"),
        )
    }

    @Test
    fun `missing shared text keeps the draft unchanged`() {
        assertEquals("Existing draft", appendSharedText("Existing draft", null))
    }
}
