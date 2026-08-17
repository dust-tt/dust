package com.dust.mobile.core.model

enum class PodTaskFilter {
    OPEN,
    DONE,
}

fun PodTaskFilter.periodQueryValue(): String =
    when (this) {
        PodTaskFilter.OPEN -> "active"
        PodTaskFilter.DONE -> "last_30d"
    }

fun PodNotificationCondition.displayLabel(): String =
    when (this) {
        PodNotificationCondition.ALL_MESSAGES -> "All messages"
        PodNotificationCondition.ONLY_MENTIONS -> "Only mentions"
        PodNotificationCondition.NEVER -> "Nothing"
    }

fun PodDetails.accessLabel(): String = if (isRestricted) "Restricted" else "Open"

fun PodFileEntry.relativePath(podId: String): String =
    path.removePrefix("pod-$podId/").removePrefix("/").trimEnd('/')

fun podFileChildren(
    files: List<PodFileEntry>,
    podId: String,
    folderPath: String,
): List<PodFileEntry> {
    val normalizedFolder = folderPath.trim('/')
    return files
        .filter { entry ->
            val relativePath = entry.relativePath(podId)
            val parent = relativePath.substringBeforeLast('/', missingDelimiterValue = "")
            parent == normalizedFolder
        }
        .sortedWith(compareByDescending<PodFileEntry> { it.isDirectory }.thenBy { it.fileName.lowercase() })
}

fun formatFileSize(sizeBytes: Long): String =
    when {
        sizeBytes < 1_024 -> "$sizeBytes B"
        sizeBytes < 1_024 * 1_024 -> "${sizeBytes / 1_024} KB"
        sizeBytes < 1_024L * 1_024 * 1_024 -> "${sizeBytes / (1_024 * 1_024)} MB"
        else -> "${sizeBytes / (1_024L * 1_024 * 1_024)} GB"
    }
