package com.dust.mobile.core.model

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

private fun superscript(number: Int): String =
    number.toString().map { digit -> SUPERSCRIPT_DIGITS[digit.digitToInt()] }.joinToString("")

private val CITE_REGEX = Regex(""":cite\[([^\]]*)](?:\{[^}]*\})?""")
private val SUPERSCRIPT_DIGITS = listOf("⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹")
