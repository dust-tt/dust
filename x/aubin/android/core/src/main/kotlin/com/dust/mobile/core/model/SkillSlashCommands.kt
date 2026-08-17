package com.dust.mobile.core.model

data class SkillSlashQuery(
    val startIndex: Int,
    val query: String,
)

fun activeSkillSlashQuery(text: String): SkillSlashQuery? {
    val currentLineStart = text.lastIndexOf('\n') + 1
    for (index in text.lastIndex downTo currentLineStart) {
        if (text[index] != '/') continue
        if (index > 0 && !text[index - 1].isWhitespace()) continue

        val query = text.substring(index + 1)
        if (query.firstOrNull()?.isWhitespace() == true || '/' in query) return null
        return SkillSlashQuery(startIndex = index, query = query)
    }
    return null
}

fun removeActiveSkillSlashQuery(text: String): String {
    val slashQuery = activeSkillSlashQuery(text) ?: return text
    return text.substring(0, slashQuery.startIndex)
}

fun filterSkillSlashSuggestions(
    capabilities: List<Capability>,
    selected: List<Capability>,
    query: String,
    limit: Int = 24,
): List<Capability.SkillCapability> {
    val boundedLimit = limit.coerceAtLeast(0)
    val normalizedQuery = query.trim().lowercase()
    val selectedIds = selected.mapTo(mutableSetOf()) { it.id }
    val skills = capabilities
        .filterIsInstance<Capability.SkillCapability>()
        .filterNot { it.id in selectedIds }

    if (normalizedQuery.isEmpty()) {
        return skills.sortedBy { it.sortKey }.take(boundedLimit)
    }

    return skills.mapNotNull { capability ->
        val name = capability.displayName.lowercase()
        val description = capability.displayDescription.lowercase()
        val titleSpread = subsequenceSpread(normalizedQuery, name)
        val descriptionSpread = subsequenceSpread(normalizedQuery, description)
        when {
            titleSpread != null -> SkillSlashMatch(
                capability = capability,
                sourceRank = 0,
                containsRank = if (normalizedQuery in name) 0 else 1,
                spread = titleSpread,
            )
            descriptionSpread != null -> SkillSlashMatch(
                capability = capability,
                sourceRank = 1,
                containsRank = if (normalizedQuery in description) 0 else 1,
                spread = descriptionSpread,
            )
            else -> null
        }
    }.sortedWith(
        compareBy<SkillSlashMatch>(
            { it.sourceRank },
            { it.containsRank },
            { it.spread },
            { it.capability.sortKey },
        ),
    ).map { it.capability }
        .take(boundedLimit)
}

private data class SkillSlashMatch(
    val capability: Capability.SkillCapability,
    val sourceRank: Int,
    val containsRank: Int,
    val spread: Int,
)

private fun subsequenceSpread(query: String, candidate: String): Int? {
    if (query.isEmpty()) return 0
    var queryIndex = 0
    var firstMatchIndex = -1
    var lastMatchIndex = -1
    candidate.forEachIndexed { candidateIndex, character ->
        if (queryIndex < query.length && query[queryIndex] == character) {
            if (firstMatchIndex == -1) firstMatchIndex = candidateIndex
            lastMatchIndex = candidateIndex
            queryIndex += 1
        }
    }
    return if (queryIndex == query.length) lastMatchIndex - firstMatchIndex else null
}
