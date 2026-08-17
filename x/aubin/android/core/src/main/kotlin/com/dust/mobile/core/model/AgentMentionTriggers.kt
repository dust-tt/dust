package com.dust.mobile.core.model

data class AgentMentionQuery(
    val startIndex: Int,
    val query: String,
)

fun activeAgentMentionQuery(text: String): AgentMentionQuery? {
    val currentLineStart = text.lastIndexOf('\n') + 1
    for (index in text.lastIndex downTo currentLineStart) {
        if (text[index] != '@') continue
        if (index > 0 && !text[index - 1].isWhitespace()) continue

        val query = text.substring(index + 1)
        if (query.any(Char::isWhitespace) || '@' in query) return null
        return AgentMentionQuery(startIndex = index, query = query)
    }
    return null
}

fun removeActiveAgentMentionQuery(text: String): String {
    val mentionQuery = activeAgentMentionQuery(text) ?: return text
    return text.substring(0, mentionQuery.startIndex)
}
