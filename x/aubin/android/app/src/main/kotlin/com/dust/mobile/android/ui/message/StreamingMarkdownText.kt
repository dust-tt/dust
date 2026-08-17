package com.dust.mobile.android.ui.message

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import com.dust.mobile.core.model.renderAgentMessage

@Composable
internal fun StreamingMarkdownText(
    targetContent: String,
    visibleContent: String,
) {
    val frame = remember(targetContent, visibleContent) {
        streamingMarkdownFrame(targetContent, visibleContent)
    }
    if (frame.targetText.isBlank()) return

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (frame.completedBlocks.isNotBlank()) {
            DustMarkdownText(frame.completedBlocks)
        }
        if (frame.activeTarget.isNotBlank()) {
            StreamingActiveMarkdownText(
                targetText = frame.activeTarget,
                visibleText = frame.activeVisible,
            )
        }
    }
}

internal data class StreamingMarkdownFrame(
    val targetText: String,
    val completedBlocks: String,
    val activeTarget: String,
    val activeVisible: String,
)

internal fun streamingMarkdownFrame(
    targetContent: String,
    visibleContent: String,
): StreamingMarkdownFrame {
    val targetText = streamingDisplayText(targetContent)
    val visibleCandidate = streamingDisplayText(visibleContent)
    val visibleText = targetText.substring(0, targetText.commonPrefixLengthWith(visibleCandidate))
    val boundary = visibleText.lastIndexOf("\n\n")
    return if (boundary < 0) {
        StreamingMarkdownFrame(
            targetText = targetText,
            completedBlocks = "",
            activeTarget = targetText,
            activeVisible = visibleText,
        )
    } else {
        val activeStart = boundary + 2
        StreamingMarkdownFrame(
            targetText = targetText,
            completedBlocks = visibleText.substring(0, boundary).trimEnd(),
            activeTarget = targetText.substring(activeStart),
            activeVisible = visibleText.substring(activeStart),
        )
    }
}

internal fun stableStreamingDirectivePrefix(content: String): String {
    val directiveStart = content.lastIndexOf(':')
    if (directiveStart < 0) return content
    val suffix = content.substring(directiveStart)
    val matchingOpener = STREAMING_DIRECTIVE_OPENERS.firstOrNull { opener ->
        opener.startsWith(suffix) || suffix.startsWith(opener)
    } ?: return content

    if (matchingOpener.startsWith(suffix)) {
        return content.substring(0, directiveStart)
    }

    val closingBracket = suffix.indexOf(']')
    if (closingBracket < 0) {
        return content.substring(0, directiveStart)
    }
    if (matchingOpener == CITE_DIRECTIVE_OPENER) {
        val trailing = suffix.substring(closingBracket + 1)
        return if (trailing.startsWith("{") && !trailing.contains('}')) {
            content.substring(0, directiveStart) + suffix.substring(0, closingBracket + 1)
        } else {
            content
        }
    }

    val metadata = suffix.substring(closingBracket + 1)
    return if (!metadata.startsWith("{") || !metadata.contains('}')) {
        content.substring(0, directiveStart)
    } else {
        content
    }
}

private fun streamingDisplayText(content: String): String =
    renderAgentMessage(stableStreamingDirectivePrefix(content)).displayText

private fun String.commonPrefixLengthWith(other: String): Int {
    val maxLength = minOf(length, other.length)
    var index = 0
    while (index < maxLength && this[index] == other[index]) {
        index += 1
    }
    return index
}

private const val CITE_DIRECTIVE_OPENER = ":cite["
private val STREAMING_DIRECTIVE_OPENERS = listOf(
    CITE_DIRECTIVE_OPENER,
    ":mention[",
    ":mention_user[",
)
