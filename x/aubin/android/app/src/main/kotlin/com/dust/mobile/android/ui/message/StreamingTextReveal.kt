package com.dust.mobile.android.ui.message

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import com.dust.mobile.android.ui.common.motionEnabled
import kotlinx.coroutines.isActive
import kotlin.math.ceil

@Composable
internal fun rememberStreamingText(
    streamKey: String,
    text: String,
    isStreaming: Boolean,
    resetOnNonAppend: Boolean = false,
): String {
    val shouldAnimate = motionEnabled()
    val latestText by rememberUpdatedState(text)
    var reveal by remember(streamKey) {
        mutableStateOf(StreamingTextRevealState.fullyRevealed(text))
    }

    LaunchedEffect(streamKey, isStreaming, shouldAnimate) {
        if (!isStreaming || !shouldAnimate) {
            reveal = StreamingTextRevealState.fullyRevealed(latestText)
            return@LaunchedEffect
        }

        var lastRevealFrame = 0L
        while (isActive) {
            val frameTime = withFrameNanos { it }
            reveal = reveal.withStreamingTarget(latestText, resetOnNonAppend)
            if (frameTime - lastRevealFrame >= STREAMING_REVEAL_FRAME_NANOS) {
                reveal = reveal.advance()
                lastRevealFrame = frameTime
            }
        }
    }

    return if (isStreaming && shouldAnimate) reveal.visibleText else text
}

internal data class StreamingTextRevealState(
    val targetText: String,
    val revealedCodePoints: Int,
) {
    val visibleText: String
        get() = targetText.prefixByCodePoints(revealedCodePoints)

    fun withStreamingTarget(
        nextTarget: String,
        resetOnNonAppend: Boolean = false,
    ): StreamingTextRevealState {
        val visible = visibleText
        return if (nextTarget.startsWith(visible)) {
            copy(targetText = nextTarget)
        } else if (resetOnNonAppend) {
            StreamingTextRevealState(
                targetText = nextTarget,
                revealedCodePoints = rollingWindowRevealCodePoints(visible, nextTarget),
            )
        } else {
            this
        }
    }

    fun advance(): StreamingTextRevealState {
        val targetCodePoints = targetText.codePointCount()
        val backlog = targetCodePoints - revealedCodePoints
        if (backlog <= 0) return this
        return copy(
            revealedCodePoints = revealedCodePoints + streamingRevealStepSize(backlog),
        )
    }

    companion object {
        fun fullyRevealed(text: String): StreamingTextRevealState =
            StreamingTextRevealState(
                targetText = text,
                revealedCodePoints = text.codePointCount(),
            )
    }
}

internal fun rollingWindowRevealCodePoints(
    previousVisible: String,
    nextTarget: String,
): Int {
    val stablePrefix = STREAMING_WINDOW_PREFIX.takeIf {
        previousVisible.startsWith(it) && nextTarget.startsWith(it)
    }.orEmpty()
    val previousCodePoints = previousVisible.removePrefix(stablePrefix).toCodePointArray()
    val nextCodePoints = nextTarget.removePrefix(stablePrefix).toCodePointArray()
    if (previousCodePoints.isEmpty() || nextCodePoints.isEmpty()) {
        return stablePrefix.codePointCount()
    }

    val fallback = IntArray(nextCodePoints.size)
    var matched = 0
    for (index in 1 until nextCodePoints.size) {
        while (matched > 0 && nextCodePoints[index] != nextCodePoints[matched]) {
            matched = fallback[matched - 1]
        }
        if (nextCodePoints[index] == nextCodePoints[matched]) matched += 1
        fallback[index] = matched
    }

    matched = 0
    previousCodePoints.forEachIndexed { index, codePoint ->
        while (matched > 0 && codePoint != nextCodePoints[matched]) {
            matched = fallback[matched - 1]
        }
        if (codePoint == nextCodePoints[matched]) matched += 1
        if (matched == nextCodePoints.size && index != previousCodePoints.lastIndex) {
            matched = fallback[matched - 1]
        }
    }
    return stablePrefix.codePointCount() + matched
}

internal fun streamingRevealStepSize(backlogCodePoints: Int): Int =
    if (backlogCodePoints <= 0) {
        0
    } else {
        ceil(backlogCodePoints * STREAMING_REVEAL_EASE_OUT_FRACTION)
            .toInt()
            .coerceIn(1, STREAMING_REVEAL_MAX_CODE_POINTS_PER_FRAME)
    }

private fun String.codePointCount(): Int = codePointCount(0, length)

private fun String.toCodePointArray(): IntArray {
    val codePoints = IntArray(codePointCount())
    var charIndex = 0
    var codePointIndex = 0
    while (charIndex < length) {
        val codePoint = codePointAt(charIndex)
        codePoints[codePointIndex] = codePoint
        charIndex += Character.charCount(codePoint)
        codePointIndex += 1
    }
    return codePoints
}

private fun String.prefixByCodePoints(count: Int): String {
    val safeCount = count.coerceIn(0, codePointCount())
    return substring(0, offsetByCodePoints(0, safeCount))
}

private const val STREAMING_REVEAL_FRAME_NANOS = 16_000_000L
private const val STREAMING_REVEAL_EASE_OUT_FRACTION = 0.16
private const val STREAMING_REVEAL_MAX_CODE_POINTS_PER_FRAME = 10
private const val STREAMING_WINDOW_PREFIX = "..."
