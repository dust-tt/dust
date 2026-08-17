package com.dust.mobile.android.ui.message

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import com.dust.mobile.core.model.MarkdownBlock
import com.dust.mobile.core.model.MarkdownInline
import com.dust.mobile.core.model.MarkdownTableCell
import com.dust.mobile.core.model.renderMessageMarkdown

internal fun stabilizeStreamingMarkdown(content: String): String {
    val lineStart = content.lastIndexOf('\n') + 1
    val line = content.substring(lineStart)
    if (INCOMPLETE_BLOCK_PREFIX.matches(line)) {
        return content.substring(0, lineStart)
    }

    val openMarkers = openInlineMarkers(line)
    if (openMarkers.isEmpty()) return content

    val lastOpen = openMarkers.last()
    if (line.substring(lastOpen.index + lastOpen.marker.length).isBlank()) {
        val markerStart = lineStart + lastOpen.index
        return content.removeRange(markerStart, markerStart + lastOpen.marker.length)
    }
    return content + openMarkers.asReversed().joinToString("") { it.marker }
}

internal fun streamingAnnotatedText(
    content: String,
    style: StreamingMarkdownStyle,
): AnnotatedString {
    val document = renderMessageMarkdown(content)
    return buildAnnotatedString {
        document.blocks.forEachIndexed { index, block ->
            if (index > 0) append('\n')
            appendBlock(block, style)
        }
    }
}

private fun AnnotatedString.Builder.appendBlock(
    block: MarkdownBlock,
    style: StreamingMarkdownStyle,
) {
    when (block) {
        is MarkdownBlock.Paragraph -> appendInlines(block.inlines, style)
        is MarkdownBlock.Heading -> withStyle(style.heading(block.level).toSpanStyle()) {
            appendInlines(block.inlines, style, FontWeight.SemiBold)
        }
        is MarkdownBlock.Quote -> withStyle(SpanStyle(color = style.mutedColor)) {
            append("|  ")
            appendInlines(block.inlines, style, color = style.mutedColor)
        }
        is MarkdownBlock.ListItem -> {
            withStyle(SpanStyle(color = style.mutedColor)) {
                append(block.number?.let { "$it.  " } ?: "\u2022  ")
            }
            appendInlines(block.inlines, style)
        }
        is MarkdownBlock.TaskListItem -> {
            withStyle(SpanStyle(color = style.mutedColor)) {
                append(if (block.checked) "[x]  " else "[ ]  ")
            }
            appendInlines(block.inlines, style)
        }
        is MarkdownBlock.Table -> {
            appendTableRow(block.headers, style, FontWeight.SemiBold)
            block.rows.forEach { row ->
                append('\n')
                appendTableRow(row, style)
            }
        }
        is MarkdownBlock.CodeBlock -> withStyle(
            SpanStyle(
                background = style.codeBackground,
                fontFamily = FontFamily.Monospace,
            ),
        ) {
            append(block.code)
        }
        MarkdownBlock.Divider -> withStyle(SpanStyle(color = style.mutedColor)) {
            append("--------")
        }
    }
}

private fun AnnotatedString.Builder.appendTableRow(
    cells: List<MarkdownTableCell>,
    style: StreamingMarkdownStyle,
    fontWeight: FontWeight? = null,
) {
    cells.forEachIndexed { index, cell ->
        if (index > 0) append("  |  ")
        appendInlines(cell.inlines, style, fontWeight)
    }
}

private fun AnnotatedString.Builder.appendInlines(
    inlines: List<MarkdownInline>,
    style: StreamingMarkdownStyle,
    fontWeight: FontWeight? = null,
    color: Color = style.textColor,
) {
    inlines.forEach { inline ->
        val span = when (inline) {
            is MarkdownInline.Text -> SpanStyle(color = color, fontWeight = fontWeight)
            is MarkdownInline.Strong -> SpanStyle(color = color, fontWeight = FontWeight.SemiBold)
            is MarkdownInline.Emphasis -> SpanStyle(
                color = color,
                fontStyle = FontStyle.Italic,
                fontWeight = fontWeight,
            )
            is MarkdownInline.Strikethrough -> SpanStyle(
                color = color,
                fontWeight = fontWeight,
                textDecoration = TextDecoration.LineThrough,
            )
            is MarkdownInline.Code -> SpanStyle(
                color = color,
                background = style.codeBackground,
                fontFamily = FontFamily.Monospace,
            )
            is MarkdownInline.Mention -> SpanStyle(
                color = style.linkColor,
                fontWeight = FontWeight.SemiBold,
            )
            is MarkdownInline.Link -> SpanStyle(
                color = style.linkColor,
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
            )
        }
        withStyle(span) {
            append(inline.displayText())
        }
    }
}

private fun MarkdownInline.displayText(): String = when (this) {
    is MarkdownInline.Text -> text
    is MarkdownInline.Strong -> text
    is MarkdownInline.Emphasis -> text
    is MarkdownInline.Strikethrough -> text
    is MarkdownInline.Code -> text
    is MarkdownInline.Mention -> label
    is MarkdownInline.Link -> label
}

private data class OpenMarker(val marker: String, val index: Int)

private fun openInlineMarkers(line: String): List<OpenMarker> {
    val stack = mutableListOf<OpenMarker>()
    var index = 0
    while (index < line.length) {
        if (line[index] == '\\') {
            index += 2
            continue
        }
        val marker = INLINE_MARKERS.firstOrNull { line.startsWith(it, index) }
        if (marker == null || shouldIgnoreMarker(line, marker, index)) {
            index += 1
            continue
        }
        if (stack.lastOrNull()?.marker == "`" && marker != "`") {
            index += marker.length
            continue
        }
        if (stack.lastOrNull()?.marker == marker) {
            stack.removeAt(stack.lastIndex)
        } else {
            stack += OpenMarker(marker, index)
        }
        index += marker.length
    }
    return stack
}

private fun shouldIgnoreMarker(line: String, marker: String, index: Int): Boolean {
    val previous = line.getOrNull(index - 1)
    val next = line.getOrNull(index + marker.length)
    if (marker == "*" && line.substring(0, index).isBlank() && next?.isWhitespace() == true) {
        return true
    }
    if (marker == "_" && previous?.isLetterOrDigit() == true && next?.isLetterOrDigit() == true) {
        return true
    }
    return false
}

private val INCOMPLETE_BLOCK_PREFIX = Regex("""^\s*(?:[-*+]|\d+[.)]|#{1,6})\s*$""")
private val INLINE_MARKERS = listOf("**", "__", "~~", "`", "*", "_")
