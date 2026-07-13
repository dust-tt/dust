package com.dust.mobile.core.model

data class CiteEntry(
    val ref: String,
    val number: Int,
)

data class RenderedAgentMessage(
    val displayText: String,
    val citeMapping: List<CiteEntry>,
) {
    companion object {
        val Empty = RenderedAgentMessage(displayText = "", citeMapping = emptyList())
    }
}

data class RenderedMarkdownDocument(
    val blocks: List<MarkdownBlock>,
) {
    companion object {
        val Empty = RenderedMarkdownDocument(blocks = emptyList())
    }
}

data class MarkdownTableCell(
    val inlines: List<MarkdownInline>,
)

sealed interface MarkdownBlock {
    data class Paragraph(val inlines: List<MarkdownInline>) : MarkdownBlock
    data class Heading(val level: Int, val inlines: List<MarkdownInline>) : MarkdownBlock
    data class Quote(val inlines: List<MarkdownInline>) : MarkdownBlock
    data class ListItem(val number: Int?, val inlines: List<MarkdownInline>) : MarkdownBlock
    data class TaskListItem(val checked: Boolean, val inlines: List<MarkdownInline>) : MarkdownBlock
    data class Table(val headers: List<MarkdownTableCell>, val rows: List<List<MarkdownTableCell>>) : MarkdownBlock
    data class CodeBlock(val code: String, val language: String?) : MarkdownBlock
    data object Divider : MarkdownBlock
}

sealed interface MarkdownInline {
    data class Text(val text: String) : MarkdownInline
    data class Strong(val text: String) : MarkdownInline
    data class Emphasis(val text: String) : MarkdownInline
    data class Strikethrough(val text: String) : MarkdownInline
    data class Code(val text: String) : MarkdownInline
    data class Mention(val label: String) : MarkdownInline
    data class Link(val label: String, val url: String) : MarkdownInline
}

fun renderAgentMessage(content: String): RenderedAgentMessage {
    val mentioned = replaceMentionDirectives(content)
    val cited = processCiteDirectives(mentioned)
    return RenderedAgentMessage(displayText = cited.text, citeMapping = cited.mapping)
}

fun preprocessMessageText(content: String): String =
    processCiteDirectives(replaceMentionDirectives(content)).text

fun renderMessageMarkdown(content: String): RenderedMarkdownDocument {
    val markdown = preprocessMessageText(content)
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .trimEnd()

    if (markdown.isBlank()) {
        return RenderedMarkdownDocument.Empty
    }

    val blocks = mutableListOf<MarkdownBlock>()
    val paragraphLines = mutableListOf<String>()
    val lines = markdown.lines()
    var index = 0

    fun flushParagraph() {
        if (paragraphLines.isEmpty()) {
            return
        }
        blocks += MarkdownBlock.Paragraph(parseMarkdownInlines(paragraphLines.joinToString(" ").trim()))
        paragraphLines.clear()
    }

    while (index < lines.size) {
        val line = lines[index]
        val trimmed = line.trim()

        when {
            trimmed.isEmpty() -> {
                flushParagraph()
                index += 1
            }

            trimmed.startsWith(CODE_FENCE_MARKER) || trimmed.startsWith(TILDE_FENCE_MARKER) -> {
                flushParagraph()
                val marker = if (trimmed.startsWith(CODE_FENCE_MARKER)) {
                    CODE_FENCE_MARKER
                } else {
                    TILDE_FENCE_MARKER
                }
                val language = trimmed.removePrefix(marker).trim().ifBlank { null }
                val codeLines = mutableListOf<String>()
                index += 1

                while (index < lines.size && !lines[index].trim().startsWith(marker)) {
                    codeLines += lines[index]
                    index += 1
                }
                if (index < lines.size) {
                    index += 1
                }
                blocks += MarkdownBlock.CodeBlock(
                    code = codeLines.joinToString("\n").trimEnd(),
                    language = language,
                )
            }

            HORIZONTAL_RULE_REGEX.matches(trimmed) -> {
                flushParagraph()
                blocks += MarkdownBlock.Divider
                index += 1
            }

            HEADING_REGEX.matches(trimmed) -> {
                flushParagraph()
                val match = HEADING_REGEX.matchEntire(trimmed) ?: error("validated by matches")
                blocks += MarkdownBlock.Heading(
                    level = match.groupValues[1].length.coerceIn(1, 3),
                    inlines = parseMarkdownInlines(match.groupValues[2].trim()),
                )
                index += 1
            }

            parseTable(lines, index) != null -> {
                flushParagraph()
                val table = parseTable(lines, index) ?: error("validated by previous parse")
                blocks += table.block
                index = table.nextIndex
            }

            QUOTE_REGEX.matches(trimmed) -> {
                flushParagraph()
                val quoteLines = mutableListOf<String>()
                while (index < lines.size) {
                    val quoteMatch = QUOTE_REGEX.matchEntire(lines[index].trim()) ?: break
                    quoteLines += quoteMatch.groupValues[1].trim()
                    index += 1
                }
                blocks += MarkdownBlock.Quote(parseMarkdownInlines(quoteLines.joinToString(" ").trim()))
            }

            TASK_LIST_ITEM_REGEX.matches(trimmed) -> {
                flushParagraph()
                val match = TASK_LIST_ITEM_REGEX.matchEntire(trimmed) ?: error("validated by matches")
                blocks += MarkdownBlock.TaskListItem(
                    checked = match.groupValues[1].equals("x", ignoreCase = true),
                    inlines = parseMarkdownInlines(match.groupValues[2].trim()),
                )
                index += 1
            }

            LIST_ITEM_REGEX.matches(trimmed) -> {
                flushParagraph()
                val match = LIST_ITEM_REGEX.matchEntire(trimmed) ?: error("validated by matches")
                blocks += MarkdownBlock.ListItem(
                    number = match.groupValues[1].takeIf { it.isNotBlank() }?.toIntOrNull(),
                    inlines = parseMarkdownInlines(match.groupValues[2].trim()),
                )
                index += 1
            }

            else -> {
                paragraphLines += trimmed
                index += 1
            }
        }
    }

    flushParagraph()
    return RenderedMarkdownDocument(blocks = blocks)
}

private data class TableParseResult(
    val block: MarkdownBlock.Table,
    val nextIndex: Int,
)

private fun parseTable(lines: List<String>, startIndex: Int): TableParseResult? {
    val headerCells = parseTableRow(lines.getOrNull(startIndex) ?: return null) ?: return null
    val separatorCells = parseTableRow(lines.getOrNull(startIndex + 1) ?: return null) ?: return null
    if (headerCells.size != separatorCells.size || !separatorCells.all(::isTableSeparatorCell)) {
        return null
    }

    val rows = mutableListOf<List<MarkdownTableCell>>()
    var index = startIndex + 2
    while (index < lines.size) {
        val rowCells = parseTableRow(lines[index]) ?: break
        if (rowCells.size != headerCells.size) {
            break
        }
        rows += rowCells.map(::markdownTableCell)
        index += 1
    }

    return TableParseResult(
        block = MarkdownBlock.Table(
            headers = headerCells.map(::markdownTableCell),
            rows = rows,
        ),
        nextIndex = index,
    )
}

private fun parseTableRow(line: String): List<String>? {
    val trimmed = line.trim()
    if (!trimmed.contains("|")) {
        return null
    }
    val content = trimmed.trim('|')
    val cells = content.split('|').map { it.trim() }
    return cells.takeIf { it.size >= 2 }
}

private fun isTableSeparatorCell(cell: String): Boolean =
    TABLE_SEPARATOR_CELL_REGEX.matches(cell)

private fun markdownTableCell(cell: String): MarkdownTableCell =
    MarkdownTableCell(parseMarkdownInlines(cell))

fun processCiteDirectives(markdown: String): CiteProcessResult {
    var counter = 0
    val seen = linkedMapOf<String, Int>()
    val ordered = mutableListOf<CiteEntry>()
    val result = StringBuilder()
    var cursor = 0

    for (match in CITE_REGEX.findAll(markdown)) {
        result.append(markdown.substring(cursor, match.range.first))
        val markers = match.groupValues[1]
            .split(",")
            .mapNotNull { ref ->
                val trimmed = ref.trim()
                if (trimmed.isEmpty()) {
                    null
                } else {
                    val number = seen.getOrPut(trimmed) {
                        counter += 1
                        ordered += CiteEntry(ref = trimmed, number = counter)
                        counter
                    }
                    superscript(number)
                }
            }
        result.append(markers.joinToString(separator = "\u2009"))
        cursor = match.range.last + 1
    }
    result.append(markdown.substring(cursor))
    return CiteProcessResult(text = result.toString(), mapping = ordered)
}

data class CiteProcessResult(
    val text: String,
    val mapping: List<CiteEntry>,
)

private fun replaceMentionDirectives(content: String): String =
    MENTION_REGEX.replace(content) { match -> "[@${match.groupValues[1]}](dust://mention)" }

private fun parseMarkdownInlines(text: String): List<MarkdownInline> {
    val inlines = mutableListOf<MarkdownInline>()
    var cursor = 0

    while (cursor < text.length) {
        val match = findNextInlineMatch(text, cursor) ?: break
        if (match.start > cursor) {
            inlines += MarkdownInline.Text(text.substring(cursor, match.start))
        }
        inlines += match.inline
        cursor = match.endExclusive
    }

    if (cursor < text.length) {
        inlines += MarkdownInline.Text(text.substring(cursor))
    }

    return inlines.mergeAdjacentText()
}

private fun findNextInlineMatch(text: String, startIndex: Int): InlineMatch? =
    listOfNotNull(
        LINK_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = if (it.groupValues[2] == MENTION_URL) {
                    MarkdownInline.Mention(label = it.groupValues[1])
                } else {
                    MarkdownInline.Link(label = it.groupValues[1], url = it.groupValues[2])
                },
            )
        },
        AUTOLINK_REGEX.find(text, startIndex)?.let { match ->
            val endExclusive = autolinkEndExclusive(text, match.range.last + 1)
            val url = text.substring(match.range.first, endExclusive)
            InlineMatch(
                start = match.range.first,
                endExclusive = endExclusive,
                inline = MarkdownInline.Link(label = url, url = url),
            )
        },
        INLINE_CODE_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Code(it.groupValues[1]),
            )
        },
        STRONG_ASTERISK_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Strong(it.groupValues[1]),
            )
        },
        STRONG_UNDERSCORE_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Strong(it.groupValues[1]),
            )
        },
        STRIKETHROUGH_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Strikethrough(it.groupValues[1]),
            )
        },
        EMPHASIS_ASTERISK_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Emphasis(it.groupValues[1]),
            )
        },
        EMPHASIS_UNDERSCORE_REGEX.find(text, startIndex)?.let {
            InlineMatch(
                start = it.range.first,
                endExclusive = it.range.last + 1,
                inline = MarkdownInline.Emphasis(it.groupValues[1]),
            )
        },
    ).minWithOrNull(compareBy<InlineMatch> { it.start }.thenBy { it.endExclusive })

private fun autolinkEndExclusive(text: String, initialEndExclusive: Int): Int {
    var endExclusive = initialEndExclusive
    while (endExclusive > 0 && text[endExclusive - 1] in AUTOLINK_TRAILING_PUNCTUATION) {
        endExclusive -= 1
    }
    return endExclusive
}

private fun List<MarkdownInline>.mergeAdjacentText(): List<MarkdownInline> =
    buildList {
        this@mergeAdjacentText.forEach { inline ->
            val previous = lastOrNull()
            if (previous is MarkdownInline.Text && inline is MarkdownInline.Text) {
                removeAt(lastIndex)
                add(MarkdownInline.Text(previous.text + inline.text))
            } else {
                add(inline)
            }
        }
    }

private fun superscript(number: Int): String =
    number.toString().map { digit -> SUPERSCRIPT_DIGITS[digit.digitToInt()] }.joinToString("")

private data class InlineMatch(
    val start: Int,
    val endExclusive: Int,
    val inline: MarkdownInline,
)

private const val CODE_FENCE_MARKER = "```"
private const val TILDE_FENCE_MARKER = "~~~"
private const val MENTION_URL = "dust://mention"

private val MENTION_REGEX = Regex(""":mention(?:_user)?\[([^\]]*)]\{[^}]*\}""")
private val CITE_REGEX = Regex(""":cite\[([^\]]*)](?:\{[^}]*\})?""")
private val HEADING_REGEX = Regex("""^(#{1,6})\s+(.+)$""")
private val QUOTE_REGEX = Regex("""^>\s?(.*)$""")
private val TASK_LIST_ITEM_REGEX = Regex("""^[-*+]\s+\[([ xX])]\s+(.+)$""")
private val LIST_ITEM_REGEX = Regex("""^(?:(\d+)[.)]|[-*+])\s+(.+)$""")
private val HORIZONTAL_RULE_REGEX = Regex("""^([-*_])(?:\s*\1){2,}\s*$""")
private val TABLE_SEPARATOR_CELL_REGEX = Regex("""^:?-{3,}:?$""")
private val LINK_REGEX = Regex("""\[([^\]\n]+)]\(([^)\s]+)\)""")
private val AUTOLINK_REGEX = Regex("""https?://[^\s<>()]+""")
private val INLINE_CODE_REGEX = Regex("""`([^`\n]+)`""")
private val STRONG_ASTERISK_REGEX = Regex("""\*\*([^*\n]+)\*\*""")
private val STRONG_UNDERSCORE_REGEX = Regex("""__([^_\n]+)__""")
private val STRIKETHROUGH_REGEX = Regex("""~~([^~\n]+)~~""")
private val EMPHASIS_ASTERISK_REGEX = Regex("""(?<!\*)\*([^*\n]+)\*(?!\*)""")
private val EMPHASIS_UNDERSCORE_REGEX = Regex("""(?<!\w)_([^_\n]+)_(?!\w)""")
private val AUTOLINK_TRAILING_PUNCTUATION = setOf('.', ',', ';', ':', '!', '?')
private val SUPERSCRIPT_DIGITS = listOf("⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹")
