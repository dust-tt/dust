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
        blocks += MarkdownBlock.Paragraph(
            parseMarkdownInlines(paragraphLines.joinToString(" ").trim()),
        )
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
                blocks += MarkdownBlock.Quote(
                    parseMarkdownInlines(quoteLines.joinToString(" ").trim()),
                )
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

private const val CODE_FENCE_MARKER = "```"
private const val TILDE_FENCE_MARKER = "~~~"

private val HEADING_REGEX = Regex("""^(#{1,6})\s+(.+)$""")
private val QUOTE_REGEX = Regex("""^>\s?(.*)$""")
private val TASK_LIST_ITEM_REGEX = Regex("""^[-*+]\s+\[([ xX])]\s+(.+)$""")
private val LIST_ITEM_REGEX = Regex("""^(?:(\d+)[.)]|[-*+])\s+(.+)$""")
private val HORIZONTAL_RULE_REGEX = Regex("""^([-*_])(?:\s*\1){2,}\s*$""")
private val TABLE_SEPARATOR_CELL_REGEX = Regex("""^:?-{3,}:?$""")
