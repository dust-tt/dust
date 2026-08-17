package com.dust.mobile.core.model

fun messageTextForSpeech(content: String): String {
    val rendered = renderMessageMarkdown(content)
        .blocks
        .mapNotNull(::speechTextForBlock)
        .joinToString(separator = "\n")
        .replace(SUPERSCRIPT_CITATION_REGEX, "")
    return rendered.lines().map(String::trim).filter(String::isNotEmpty).joinToString("\n")
}

private fun speechTextForBlock(block: MarkdownBlock): String? = when (block) {
    is MarkdownBlock.Paragraph -> speechTextForInlines(block.inlines)
    is MarkdownBlock.Heading -> speechTextForInlines(block.inlines)
    is MarkdownBlock.Quote -> speechTextForInlines(block.inlines)
    is MarkdownBlock.ListItem -> buildString {
        block.number?.let { append("$it. ") }
        append(speechTextForInlines(block.inlines))
    }
    is MarkdownBlock.TaskListItem -> buildString {
        append(if (block.checked) "Completed. " else "Not completed. ")
        append(speechTextForInlines(block.inlines))
    }
    is MarkdownBlock.Table -> buildList {
        add(block.headers.joinToString { speechTextForInlines(it.inlines) })
        block.rows.forEach { row ->
            add(row.joinToString { speechTextForInlines(it.inlines) })
        }
    }.joinToString(separator = ". ")
    is MarkdownBlock.CodeBlock -> "Code block omitted."
    MarkdownBlock.Divider -> null
}

private fun speechTextForInlines(inlines: List<MarkdownInline>): String =
    inlines.joinToString(separator = "") { inline ->
        when (inline) {
            is MarkdownInline.Text -> inline.text
            is MarkdownInline.Strong -> inline.text
            is MarkdownInline.Emphasis -> inline.text
            is MarkdownInline.Strikethrough -> inline.text
            is MarkdownInline.Code -> inline.text
            is MarkdownInline.Mention -> inline.label
            is MarkdownInline.Link -> inline.label
        }
    }

private val SUPERSCRIPT_CITATION_REGEX = Regex("[⁰¹²³⁴⁵⁶⁷⁸⁹]+")
