package com.dust.mobile.android.ui.frame

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EmbeddedWebViewNavigationTest {
    @Test
    fun `frame iframe stays embedded when its host differs from the wrapper`() {
        assertTrue(
            shouldKeepWebViewNavigationEmbedded(
                targetUrl = "https://viz.dust.tt/content?identifier=viz-file_123",
                allowedHost = "app.dust.tt",
                isForMainFrame = false,
            ),
        )
    }

    @Test
    fun `same-host top-level navigation stays embedded`() {
        assertTrue(
            shouldKeepWebViewNavigationEmbedded(
                targetUrl = "https://app.dust.tt/share/frame/abc",
                allowedHost = "app.dust.tt",
                isForMainFrame = true,
            ),
        )
    }

    @Test
    fun `external top-level navigation leaves the viewer`() {
        assertFalse(
            shouldKeepWebViewNavigationEmbedded(
                targetUrl = "https://example.com",
                allowedHost = "app.dust.tt",
                isForMainFrame = true,
            ),
        )
    }
}
