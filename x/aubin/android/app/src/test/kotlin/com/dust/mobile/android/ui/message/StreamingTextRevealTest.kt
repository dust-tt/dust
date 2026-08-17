package com.dust.mobile.android.ui.message

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamingTextRevealTest {
    @Test
    fun `streaming reveal only appends visible text`() {
        var reveal = StreamingTextRevealState.fullyRevealed("Hello")
            .withStreamingTarget("Hello from Dust")
        val frames = mutableListOf(reveal.visibleText)

        while (reveal.visibleText != reveal.targetText) {
            reveal = reveal.advance()
            frames += reveal.visibleText
        }

        assertEquals("Hello from Dust", reveal.visibleText)
        assertTrue(frames.zipWithNext().all { (before, after) -> after.startsWith(before) })
    }

    @Test
    fun `streaming reveal ignores a target that would erase visible text`() {
        val reveal = StreamingTextRevealState.fullyRevealed("Visible answer")
            .withStreamingTarget("Replacement")

        assertEquals("Visible answer", reveal.visibleText)
        assertEquals("Visible answer", reveal.targetText)
    }

    @Test
    fun `replaceable streaming viewport preserves overlap and reveals the new tail`() {
        var reveal = StreamingTextRevealState.fullyRevealed("...abcdef")
            .withStreamingTarget("...cdefgh", resetOnNonAppend = true)

        assertEquals("...cdefgh", reveal.targetText)
        assertEquals("...cdef", reveal.visibleText)

        reveal = reveal.advance()

        assertEquals("...cdefg", reveal.visibleText)
    }

    @Test
    fun `replaceable streaming viewport handles unicode overlap`() {
        val reveal = StreamingTextRevealState.fullyRevealed("...A\uD83D\uDE80B")
            .withStreamingTarget("...\uD83D\uDE80BC", resetOnNonAppend = true)

        assertEquals("...\uD83D\uDE80B", reveal.visibleText)
    }

    @Test
    fun `streaming reveal can replace a suffix that has not appeared yet`() {
        var reveal = StreamingTextRevealState.fullyRevealed("Dust")
            .withStreamingTarget("Dust builds the first draft")
        reveal = reveal.advance()
        val visibleBeforeReplacement = reveal.visibleText

        reveal = reveal.withStreamingTarget("$visibleBeforeReplacement and the final response")

        assertTrue(reveal.targetText.startsWith(visibleBeforeReplacement))
        assertEquals(visibleBeforeReplacement, reveal.visibleText)
    }

    @Test
    fun `streaming reveal does not split supplementary unicode characters`() {
        var reveal = StreamingTextRevealState.fullyRevealed("")
            .withStreamingTarget("A\uD83D\uDE80B")
        val frames = mutableListOf<String>()

        while (reveal.visibleText != reveal.targetText) {
            reveal = reveal.advance()
            frames += reveal.visibleText
        }

        assertEquals(listOf("A", "A\uD83D\uDE80", "A\uD83D\uDE80B"), frames)
    }

    @Test
    fun `reveal step accelerates for a larger backlog`() {
        assertEquals(1, streamingRevealStepSize(1))
        assertTrue(streamingRevealStepSize(100) > streamingRevealStepSize(10))
        assertEquals(10, streamingRevealStepSize(1_000))
    }

    @Test
    fun `streaming markdown keeps completed blocks separate from the active tail`() {
        val frame = streamingMarkdownFrame(
            targetContent = "First paragraph.\n\nSecond paragraph continues",
            visibleContent = "First paragraph.\n\nSecond paragraph",
        )

        assertEquals("First paragraph.", frame.completedBlocks)
        assertEquals("Second paragraph continues", frame.activeTarget)
        assertEquals("Second paragraph", frame.activeVisible)
    }

    @Test
    fun `streaming markdown keeps a single unfinished block active`() {
        val frame = streamingMarkdownFrame(
            targetContent = "Still writing the answer",
            visibleContent = "Still writing",
        )

        assertEquals("", frame.completedBlocks)
        assertEquals("Still writing the answer", frame.activeTarget)
        assertEquals("Still writing", frame.activeVisible)
    }

    @Test
    fun `streaming markdown hides incomplete Dust directives`() {
        assertEquals("See ", stableStreamingDirectivePrefix("See :cite[document"))
        assertEquals("Ask ", stableStreamingDirectivePrefix("Ask :mention[Dust]{sId=dus"))
        assertEquals(
            "See :cite[document]",
            stableStreamingDirectivePrefix("See :cite[document]{provider=drive"),
        )
    }

    @Test
    fun `streaming markdown reveals completed Dust directives without raw syntax`() {
        val citation = streamingMarkdownFrame(
            targetContent = "See :cite[document]{} for details",
            visibleContent = "See :cite[document]{}",
        )

        assertEquals("See ¹ for details", citation.targetText)
        assertEquals("See ¹", citation.activeVisible)
    }

    @Test
    fun `streaming markdown closes unfinished inline formatting for presentation`() {
        assertEquals("", stabilizeStreamingMarkdown("**"))
        assertEquals("**This week**", stabilizeStreamingMarkdown("**This week"))
        assertEquals("Use `make verify`", stabilizeStreamingMarkdown("Use `make verify"))
        assertEquals("**This week**", stabilizeStreamingMarkdown("**This week**"))
    }

    @Test
    fun `streaming markdown hides unfinished block prefixes`() {
        assertEquals("Answer\n", stabilizeStreamingMarkdown("Answer\n-"))
        assertEquals("Answer\n", stabilizeStreamingMarkdown("Answer\n## "))
        assertEquals("Answer\n- Next", stabilizeStreamingMarkdown("Answer\n- Next"))
    }

    @Test
    fun `streaming markdown leaves ordinary word markers stable`() {
        assertEquals("snake_case", stabilizeStreamingMarkdown("snake_case"))
        assertEquals("*strong* next", stabilizeStreamingMarkdown("*strong* next"))
    }

    @Test
    fun `streaming markdown presentation remains append only across formatting`() {
        val rawFrames = listOf(
            "**",
            "**This",
            "**This week**\n-",
            "**This week**\n- The rollout",
            "**This week**\n- The rollout\n- Next",
        )
        val renderedFrames = rawFrames.map { raw ->
            streamingAnnotatedText(stabilizeStreamingMarkdown(raw), TEST_MARKDOWN_STYLE).text
        }

        assertTrue(renderedFrames.zipWithNext().all { (before, after) -> after.startsWith(before) })
        assertEquals("This week\n\u2022  The rollout\n\u2022  Next", renderedFrames.last())
    }

    @Test
    fun `thinking timeline renders strong markdown instead of markers`() {
        val rendered = activityThinkingAnnotatedText("**hi**", TEST_MARKDOWN_STYLE)

        assertEquals("hi", rendered.text)
        assertTrue(
            rendered.spanStyles.any { span ->
                span.start == 0 && span.end == 2 && span.item.fontWeight == FontWeight.SemiBold
            },
        )
    }

    private companion object {
        val TEST_MARKDOWN_STYLE = StreamingMarkdownStyle(
            body = TextStyle.Default,
            titleLarge = TextStyle.Default,
            titleMedium = TextStyle.Default,
            titleSmall = TextStyle.Default,
            textColor = Color.Black,
            mutedColor = Color.Gray,
            linkColor = Color.Blue,
            codeBackground = Color.LightGray,
        )
    }
}
