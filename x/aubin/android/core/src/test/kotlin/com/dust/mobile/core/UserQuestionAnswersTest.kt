package com.dust.mobile.core

import com.dust.mobile.core.model.buildUserQuestionAnswer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UserQuestionAnswersTest {
    @Test
    fun `buildUserQuestionAnswer sorts selected options and trims custom response`() {
        val answer = buildUserQuestionAnswer(setOf(2, 0), "  use the safer path  ")

        assertEquals(listOf(0, 2), answer?.selectedOptions)
        assertEquals("use the safer path", answer?.customResponse)
    }

    @Test
    fun `buildUserQuestionAnswer supports custom response without options`() {
        val answer = buildUserQuestionAnswer(emptySet(), "Something else")

        assertEquals(emptyList<Int>(), answer?.selectedOptions)
        assertEquals("Something else", answer?.customResponse)
    }

    @Test
    fun `buildUserQuestionAnswer omits blank custom response`() {
        val answer = buildUserQuestionAnswer(setOf(1), "   ")

        assertEquals(listOf(1), answer?.selectedOptions)
        assertNull(answer?.customResponse)
    }

    @Test
    fun `buildUserQuestionAnswer returns null when nothing was selected or typed`() {
        assertNull(buildUserQuestionAnswer(emptySet(), "   "))
    }
}
