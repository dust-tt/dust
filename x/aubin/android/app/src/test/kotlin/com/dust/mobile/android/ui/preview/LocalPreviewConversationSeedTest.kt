package com.dust.mobile.android.ui.preview

import com.dust.mobile.android.ui.message.formatMessageTimestamp
import java.time.ZoneId
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalPreviewConversationSeedTest {
    @Test
    fun `message timestamps accept seconds and milliseconds`() {
        val zone = ZoneId.of("UTC")
        val locale = Locale.US

        assertEquals(
            formatMessageTimestamp(1_700_000_000_000.0, zone, locale),
            formatMessageTimestamp(1_700_000_000.0, zone, locale),
        )
        assertEquals("", formatMessageTimestamp(Double.NaN, zone, locale))
    }
}
