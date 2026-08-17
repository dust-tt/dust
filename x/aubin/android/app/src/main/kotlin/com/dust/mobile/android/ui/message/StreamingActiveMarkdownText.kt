package com.dust.mobile.android.ui.message

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.interactiveSurface

@Composable
internal fun StreamingActiveMarkdownText(
    targetText: String,
    visibleText: String,
) {
    val style = StreamingMarkdownStyle.fromTheme()
    val target = remember(targetText, style) {
        streamingAnnotatedText(stabilizeStreamingMarkdown(targetText), style)
    }
    val visible = remember(visibleText, style) {
        streamingAnnotatedText(stabilizeStreamingMarkdown(visibleText), style)
    }
    if (target.isEmpty()) return

    val visibleLength = remember(target.text, visible.text) {
        target.text.commonPrefixLengthWith(visible.text)
    }
    val visibleSemantics = remember(target.text, visibleLength) {
        AnnotatedString(target.text.substring(0, visibleLength))
    }
    val textMeasurer = rememberTextMeasurer()
    val density = LocalDensity.current

    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val maxWidthPx = with(density) { maxWidth.roundToPx() }
        val layout = remember(target, style.body, maxWidthPx) {
            textMeasurer.measure(
                text = target,
                style = style.body.copy(color = style.textColor),
                constraints = Constraints(maxWidth = maxWidthPx),
            )
        }
        val visiblePath = remember(layout, visibleLength) {
            if (visibleLength == 0) null else layout.getPathForRange(0, visibleLength)
        }

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(with(density) { layout.size.height.toDp() })
                .clearAndSetSemantics { text = visibleSemantics },
        ) {
            visiblePath?.let { path ->
                clipPath(path) {
                    drawText(textLayoutResult = layout)
                }
            }
        }
    }
}

internal data class StreamingMarkdownStyle(
    val body: TextStyle,
    val titleLarge: TextStyle,
    val titleMedium: TextStyle,
    val titleSmall: TextStyle,
    val textColor: Color,
    val mutedColor: Color,
    val linkColor: Color,
    val codeBackground: Color,
) {
    fun heading(level: Int): TextStyle = when (level) {
        1 -> titleLarge
        2 -> titleMedium
        else -> titleSmall
    }

    companion object {
        @Composable
        fun fromTheme(): StreamingMarkdownStyle = StreamingMarkdownStyle(
            body = MaterialTheme.typography.bodyLarge,
            titleLarge = MaterialTheme.typography.titleLarge,
            titleMedium = MaterialTheme.typography.titleMedium,
            titleSmall = MaterialTheme.typography.titleSmall,
            textColor = MaterialTheme.colorScheme.onSurface,
            mutedColor = MaterialTheme.colorScheme.onSurfaceVariant,
            linkColor = MaterialTheme.colorScheme.action,
            codeBackground = MaterialTheme.colorScheme.interactiveSurface,
        )
    }
}

private fun String.commonPrefixLengthWith(other: String): Int {
    val maxLength = minOf(length, other.length)
    var index = 0
    while (index < maxLength && this[index] == other[index]) index += 1
    return index
}
