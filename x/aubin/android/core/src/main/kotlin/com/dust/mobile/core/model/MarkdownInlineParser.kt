package com.dust.mobile.core.model

internal fun replaceMentionDirectives(content: String): String =
    MENTION_REGEX.replace(content) { match -> "[@${match.groupValues[1]}](dust://mention)" }

internal fun parseMarkdownInlines(text: String): List<MarkdownInline> {
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

private data class InlineMatch(
    val start: Int,
    val endExclusive: Int,
    val inline: MarkdownInline,
)

private const val MENTION_URL = "dust://mention"

private val MENTION_REGEX = Regex(""":mention(?:_user)?\[([^\]]*)]\{[^}]*\}""")
private val LINK_REGEX = Regex("""\[([^\]\n]+)]\(([^)\s]+)\)""")
private val AUTOLINK_REGEX = Regex("""https?://[^\s<>()]+""")
private val INLINE_CODE_REGEX = Regex("""`([^`\n]+)`""")
private val STRONG_ASTERISK_REGEX = Regex("""\*\*([^*\n]+)\*\*""")
private val STRONG_UNDERSCORE_REGEX = Regex("""__([^_\n]+)__""")
private val STRIKETHROUGH_REGEX = Regex("""~~([^~\n]+)~~""")
private val EMPHASIS_ASTERISK_REGEX = Regex("""(?<!\*)\*([^*\n]+)\*(?!\*)""")
private val EMPHASIS_UNDERSCORE_REGEX = Regex("""(?<!\w)_([^_\n]+)_(?!\w)""")
private val AUTOLINK_TRAILING_PUNCTUATION = setOf('.', ',', ';', ':', '!', '?')
