package com.dust.mobile.core

import com.dust.mobile.core.config.AppConfig
import com.dust.mobile.core.config.withQuery
import org.junit.Assert.assertEquals
import org.junit.Test

class AppConfigTest {
    @Test
    fun `conversationUrl builds Dust web conversation URL`() {
        val config = AppConfig(
            apiBaseUrl = "https://dust.tt",
            appUrl = "https://app.dust.tt",
        )

        assertEquals(
            "https://app.dust.tt/w/wrk_123/assistant/conv_456",
            config.conversationUrl("wrk_123", "conv_456"),
        )
    }

    @Test
    fun `conversationUrl handles trailing slash in app URL`() {
        val config = AppConfig(
            apiBaseUrl = "https://dust.tt",
            appUrl = "https://app.dust.tt/",
        )

        assertEquals(
            "https://app.dust.tt/w/wrk_123/assistant/conv_456",
            config.conversationUrl("wrk_123", "conv_456"),
        )
    }

    @Test
    fun `withQuery appends encoded query parameters`() {
        assertEquals(
            "/api/search?q=hello%20world&limit=25",
            withQuery("/api/search", mapOf("q" to "hello world", "limit" to "25")),
        )
    }

    @Test
    fun `withQuery appends to existing query string with ampersand`() {
        assertEquals(
            "/api/files?action=view&lastEventId=evt%201",
            withQuery("/api/files?action=view", mapOf("lastEventId" to "evt 1")),
        )
    }

    @Test
    fun `withQuery skips null values and leaves empty query unchanged`() {
        assertEquals("/api/search", withQuery("/api/search", mapOf("q" to null)))
        assertEquals("/api/search", withQuery("/api/search", emptyMap()))
    }
}
