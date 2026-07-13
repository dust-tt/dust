package com.dust.mobile.android.ui

import java.time.ZoneId
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
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

    @Test
    fun `local preview conversation authors are customer facing labels`() {
        val authorNames = listOf("local-workspace", "local-mobile")
            .flatMap { workspaceId -> localPreviewConversations(workspaceId) }
            .mapNotNull { conversation -> conversation.preview?.authorName }

        assertEquals(
            listOf(
                "Sales Team",
                "Launch Team",
                "Mira Patel",
                "Launch Team",
                "Operations Team",
                "Mira Patel",
            ),
            authorNames,
        )
        authorNames.forEach { authorName ->
            assertFalse("Sample preview author should not be a raw handle: $authorName", authorName.startsWith("@"))
        }

        val agentPreviews = listOf("local-workspace", "local-mobile")
            .flatMap(::localPreviewConversations)
            .mapNotNull { it.preview }
            .filter { it.isAgent }
        assertTrue(agentPreviews.isNotEmpty())
        assertTrue(agentPreviews.all { !it.authorAvatarUrl.isNullOrBlank() })
    }

    @Test
    fun `local preview created conversation authors are customer facing labels`() {
        val authorNames = listOf(
            "agent-unknown",
            "local-agent-sales",
            "local-agent-launch",
            "local-agent-memory",
        ).map(::localPreviewConversationAuthorName)

        assertEquals(listOf("Dust", "Sales Team", "Launch Team", "Memory"), authorNames)
        authorNames.forEach { authorName ->
            assertFalse("Sample preview author should not be a raw handle: $authorName", authorName.startsWith("@"))
        }
    }
}
