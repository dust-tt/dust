package com.dust.mobile.core.model

data class EmojiAvatar(
    val emoji: String,
    val backgroundToken: String,
)

fun parseEmojiAvatarUrl(urlString: String): EmojiAvatar? {
    val marker = "/emojis/bg-"
    val markerIndex = urlString.indexOf(marker)
    if (markerIndex < 0) return null

    val parts = urlString
        .substring(markerIndex + marker.length)
        .split("/")
    if (parts.size < 3) return null

    val unified = parts[2].takeWhile { it != '.' && it != '?' }
    val emoji = emojiFromUnified(unified) ?: return null
    return EmojiAvatar(
        emoji = emoji,
        backgroundToken = parts[0],
    )
}

private fun emojiFromUnified(unified: String): String? {
    if (unified.isBlank()) return null

    val builder = StringBuilder()
    for (segment in unified.split("-")) {
        val codePoint = segment.toIntOrNull(radix = 16) ?: return null
        if (!Character.isValidCodePoint(codePoint)) return null
        builder.append(Character.toChars(codePoint))
    }
    return builder.toString().ifBlank { null }
}
