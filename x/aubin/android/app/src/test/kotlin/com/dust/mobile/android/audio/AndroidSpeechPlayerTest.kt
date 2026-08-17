package com.dust.mobile.android.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidSpeechPlayerTest {
    @Test
    fun `splits speech at word boundaries`() {
        assertEquals(
            listOf("one two", "three", "four"),
            splitSpeechText("one two three four", maxLength = 7),
        )
    }

    @Test
    fun `splits a single oversized token without dropping content`() {
        val chunks = splitSpeechText("abcdefghij", maxLength = 4)

        assertEquals(listOf("abcd", "efgh", "ij"), chunks)
        assertEquals("abcdefghij", chunks.joinToString(""))
        assertTrue(chunks.all { it.length <= 4 })
    }
}
