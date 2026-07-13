package com.dust.mobile.core

import com.dust.mobile.core.model.parseEmojiAvatarUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EmojiAvatarTest {
    @Test
    fun `parses Dust emoji avatar urls`() {
        val avatar = parseEmojiAvatarUrl(
            "https://dust.tt/static/emojis/bg-pink-300/avatar/1f468-200d-1f4bb.png",
        )

        assertEquals("👨‍💻", avatar?.emoji)
        assertEquals("pink-300", avatar?.backgroundToken)
    }

    @Test
    fun `strips query strings from unified emoji code`() {
        val avatar = parseEmojiAvatarUrl(
            "https://dust.tt/emojis/bg-amber-100/avatar/1f600?size=64",
        )

        assertEquals("😀", avatar?.emoji)
        assertEquals("amber-100", avatar?.backgroundToken)
    }

    @Test
    fun `ignores non emoji avatar urls`() {
        assertNull(parseEmojiAvatarUrl("https://dust.tt/avatar.png"))
        assertNull(parseEmojiAvatarUrl("https://dust.tt/emojis/bg-pink-300/avatar/not-hex.png"))
    }
}
