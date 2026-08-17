package com.dust.mobile.core

import com.dust.mobile.core.model.messageTextForSpeech
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechRenderingTest {
    @Test
    fun `turns markdown into concise speakable text`() {
        val markdown = """
            ## Launch update

            **Owners**: [Aubin](https://dust.tt) :cite[ref-1]

            - Ship Android
            - [x] Verify release

            ```kotlin
            println("done")
            ```
        """.trimIndent()

        assertEquals(
            "Launch update\nOwners: Aubin\nShip Android\nCompleted. Verify release\nCode block omitted.",
            messageTextForSpeech(markdown),
        )
    }

    @Test
    fun `reads table cells without markdown separators`() {
        val markdown = """
            | Owner | Status |
            | --- | --- |
            | Mobile | Ready |
        """.trimIndent()

        assertEquals("Owner, Status. Mobile, Ready", messageTextForSpeech(markdown))
    }
}
