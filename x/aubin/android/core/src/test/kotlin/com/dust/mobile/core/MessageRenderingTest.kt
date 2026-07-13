package com.dust.mobile.core

import com.dust.mobile.core.model.MarkdownBlock
import com.dust.mobile.core.model.MarkdownInline
import com.dust.mobile.core.model.MarkdownTableCell
import com.dust.mobile.core.model.preprocessMessageText
import com.dust.mobile.core.model.renderAgentMessage
import com.dust.mobile.core.model.renderMessageMarkdown
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageRenderingTest {
    @Test
    fun `renderAgentMessage replaces citations with stable superscripts`() {
        val rendered = renderAgentMessage(
            "First :cite[file_a,file_b]{} and again :cite[file_a]{}.",
        )

        assertEquals("First ¹ ² and again ¹.", rendered.displayText)
        assertEquals("file_a", rendered.citeMapping[0].ref)
        assertEquals(1, rendered.citeMapping[0].number)
        assertEquals("file_b", rendered.citeMapping[1].ref)
        assertEquals(2, rendered.citeMapping[1].number)
    }

    @Test
    fun `preprocessMessageText rewrites mention directives`() {
        val text = preprocessMessageText("Ask :mention_user[Ada]{sId=u1} and :mention[Dust]{sId=dust}")

        assertEquals("Ask [@Ada](dust://mention) and [@Dust](dust://mention)", text)
    }

    @Test
    fun `renderMessageMarkdown parses common markdown blocks`() {
        val document = renderMessageMarkdown(
            """
            # Summary
            - First item
            2. Second item
            > quoted **note**

            ```json
            {"ok": true}
            ```

            ---
            """.trimIndent(),
        )

        assertEquals(
            listOf(
                MarkdownBlock.Heading(level = 1, inlines = listOf(MarkdownInline.Text("Summary"))),
                MarkdownBlock.ListItem(number = null, inlines = listOf(MarkdownInline.Text("First item"))),
                MarkdownBlock.ListItem(number = 2, inlines = listOf(MarkdownInline.Text("Second item"))),
                MarkdownBlock.Quote(
                    inlines = listOf(
                        MarkdownInline.Text("quoted "),
                        MarkdownInline.Strong("note"),
                    ),
                ),
                MarkdownBlock.CodeBlock(code = """{"ok": true}""", language = "json"),
                MarkdownBlock.Divider,
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown parses task list items`() {
        val document = renderMessageMarkdown(
            """
            - [ ] Pending follow-up
            - [x] Completed **step**
            """.trimIndent(),
        )

        assertEquals(
            listOf(
                MarkdownBlock.TaskListItem(
                    checked = false,
                    inlines = listOf(MarkdownInline.Text("Pending follow-up")),
                ),
                MarkdownBlock.TaskListItem(
                    checked = true,
                    inlines = listOf(
                        MarkdownInline.Text("Completed "),
                        MarkdownInline.Strong("step"),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown preprocesses Dust directives before parsing inlines`() {
        val document = renderMessageMarkdown(
            "Ask :mention_user[Ada]{sId=u1} about [Dust](https://dust.tt), `code`, _soon_, and :cite[file]{}.",
        )

        assertEquals(
            listOf(
                MarkdownBlock.Paragraph(
                    inlines = listOf(
                        MarkdownInline.Text("Ask "),
                        MarkdownInline.Mention(label = "@Ada"),
                        MarkdownInline.Text(" about "),
                        MarkdownInline.Link(label = "Dust", url = "https://dust.tt"),
                        MarkdownInline.Text(", "),
                        MarkdownInline.Code("code"),
                        MarkdownInline.Text(", "),
                        MarkdownInline.Emphasis("soon"),
                        MarkdownInline.Text(", and ¹."),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown parses strikethrough inline text`() {
        val document = renderMessageMarkdown("Keep ~~old wording~~ new wording")

        assertEquals(
            listOf(
                MarkdownBlock.Paragraph(
                    inlines = listOf(
                        MarkdownInline.Text("Keep "),
                        MarkdownInline.Strikethrough("old wording"),
                        MarkdownInline.Text(" new wording"),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown autolinks bare http URLs`() {
        val document = renderMessageMarkdown("See https://dust.tt/docs, then continue.")

        assertEquals(
            listOf(
                MarkdownBlock.Paragraph(
                    inlines = listOf(
                        MarkdownInline.Text("See "),
                        MarkdownInline.Link(label = "https://dust.tt/docs", url = "https://dust.tt/docs"),
                        MarkdownInline.Text(", then continue."),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown keeps URLs inside code spans as code`() {
        val document = renderMessageMarkdown("Run `curl https://dust.tt/docs`")

        assertEquals(
            listOf(
                MarkdownBlock.Paragraph(
                    inlines = listOf(
                        MarkdownInline.Text("Run "),
                        MarkdownInline.Code("curl https://dust.tt/docs"),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown parses pipe tables with inline content`() {
        val document = renderMessageMarkdown(
            """
            | Name | Status |
            | --- | :---: |
            | Dust | **Ready** |
            | Mobile | `native` |
            """.trimIndent(),
        )

        assertEquals(
            listOf(
                MarkdownBlock.Table(
                    headers = listOf(
                        MarkdownTableCell(listOf(MarkdownInline.Text("Name"))),
                        MarkdownTableCell(listOf(MarkdownInline.Text("Status"))),
                    ),
                    rows = listOf(
                        listOf(
                            MarkdownTableCell(listOf(MarkdownInline.Text("Dust"))),
                            MarkdownTableCell(listOf(MarkdownInline.Strong("Ready"))),
                        ),
                        listOf(
                            MarkdownTableCell(listOf(MarkdownInline.Text("Mobile"))),
                            MarkdownTableCell(listOf(MarkdownInline.Code("native"))),
                        ),
                    ),
                ),
            ),
            document.blocks,
        )
    }

    @Test
    fun `renderMessageMarkdown leaves non table pipes as paragraph text`() {
        val document = renderMessageMarkdown(
            """
            | Name | Status |
            | not | separator |
            """.trimIndent(),
        )

        assertEquals(
            listOf(
                MarkdownBlock.Paragraph(
                    listOf(MarkdownInline.Text("| Name | Status | | not | separator |")),
                ),
            ),
            document.blocks,
        )
    }
}
