package com.dust.mobile.android.ui.composer

import org.junit.Assert.assertEquals
import org.junit.Test

class CapabilitySelectorTest {
    @Test
    fun `empty label treats only an empty query as no search`() {
        assertEquals("No tools or skills available", capabilitySearchEmptyLabel(""))
        assertEquals("No results", capabilitySearchEmptyLabel(" "))
    }
}
