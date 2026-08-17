package com.dust.mobile.android.ui.message

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.MarkdownBlock
import com.dust.mobile.core.model.MarkdownInline
import com.dust.mobile.core.model.MarkdownTableCell
import com.dust.mobile.core.model.RenderedMarkdownDocument
import com.dust.mobile.core.model.renderMessageMarkdown

@Composable
internal fun DustMarkdownText(
    content: String,
    modifier: Modifier = Modifier,
    selectable: Boolean = false,
) {
    val document = remember(content) { renderMessageMarkdown(content) }
    if (selectable) {
        SelectionContainer {
            DustMarkdownDocument(document = document, modifier = modifier)
        }
    } else {
        DustMarkdownDocument(document = document, modifier = modifier)
    }
}

@Composable
private fun DustMarkdownDocument(
    document: RenderedMarkdownDocument,
    modifier: Modifier = Modifier,
) {
    if (document.blocks.isEmpty()) {
        return
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        document.blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Paragraph -> DustInlineText(
                    inlines = block.inlines,
                    style = MaterialTheme.typography.bodyLarge,
                )
                is MarkdownBlock.Heading -> DustInlineText(
                    inlines = block.inlines,
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.titleLarge
                        2 -> MaterialTheme.typography.titleMedium
                        else -> MaterialTheme.typography.titleSmall
                    },
                    fontWeight = FontWeight.SemiBold,
                )
                is MarkdownBlock.Quote -> Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 3.dp, height = 24.dp)
                            .background(MaterialTheme.colorScheme.subtleBorder, RoundedCornerShape(2.dp)),
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                is MarkdownBlock.ListItem -> Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        block.number?.let { "$it." } ?: "•",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                is MarkdownBlock.TaskListItem -> Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Checkbox(
                        checked = block.checked,
                        onCheckedChange = null,
                        enabled = false,
                        modifier = Modifier.size(24.dp),
                    )
                    DustInlineText(
                        inlines = block.inlines,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                is MarkdownBlock.Table -> DustMarkdownTable(block)
                is MarkdownBlock.CodeBlock -> Text(
                    block.code,
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .background(MaterialTheme.colorScheme.interactiveSurface, RoundedCornerShape(8.dp))
                        .padding(12.dp),
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
                MarkdownBlock.Divider -> HorizontalDivider()
            }
        }
    }
}

@Composable
private fun DustMarkdownTable(table: MarkdownBlock.Table) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.interactiveSurface),
    ) {
        DustMarkdownTableRow(cells = table.headers, isHeader = true)
        table.rows.forEach { row ->
            HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
            DustMarkdownTableRow(cells = row, isHeader = false)
        }
    }
}

@Composable
private fun DustMarkdownTableRow(cells: List<MarkdownTableCell>, isHeader: Boolean) {
    Row {
        cells.forEach { cell ->
            DustInlineText(
                inlines = cell.inlines,
                modifier = Modifier
                    .widthIn(min = 112.dp)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                style = if (isHeader) {
                    MaterialTheme.typography.labelMedium
                } else {
                    MaterialTheme.typography.bodyMedium
                },
                fontWeight = if (isHeader) FontWeight.SemiBold else null,
            )
        }
    }
}

@Composable
private fun DustInlineText(
    inlines: List<MarkdownInline>,
    modifier: Modifier = Modifier,
    style: TextStyle,
    color: Color = MaterialTheme.colorScheme.onSurface,
    fontWeight: FontWeight? = null,
) {
    val linkColor = MaterialTheme.colorScheme.action
    val codeBackgroundColor = MaterialTheme.colorScheme.interactiveSurface
    val annotatedText = remember(inlines, color, fontWeight, linkColor, codeBackgroundColor) {
        buildAnnotatedString {
            inlines.forEach { inline ->
                when (inline) {
                    is MarkdownInline.Text -> withStyle(
                        SpanStyle(color = color, fontWeight = fontWeight),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Strong -> withStyle(
                        SpanStyle(color = color, fontWeight = FontWeight.SemiBold),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Emphasis -> withStyle(
                        SpanStyle(color = color, fontStyle = FontStyle.Italic, fontWeight = fontWeight),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Strikethrough -> withStyle(
                        SpanStyle(
                            color = color,
                            fontWeight = fontWeight,
                            textDecoration = TextDecoration.LineThrough,
                        ),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Code -> withStyle(
                        SpanStyle(
                            color = color,
                            background = codeBackgroundColor,
                            fontFamily = FontFamily.Monospace,
                        ),
                    ) {
                        append(inline.text)
                    }
                    is MarkdownInline.Mention -> withStyle(
                        SpanStyle(color = linkColor, fontWeight = FontWeight.SemiBold),
                    ) {
                        append(inline.label)
                    }
                    is MarkdownInline.Link -> {
                        withLink(
                            LinkAnnotation.Url(
                                url = inline.url,
                                styles = TextLinkStyles(
                                    style = SpanStyle(
                                        color = linkColor,
                                        fontWeight = FontWeight.SemiBold,
                                        textDecoration = TextDecoration.Underline,
                                    ),
                                ),
                            ),
                        ) {
                            append(inline.label)
                        }
                    }
                }
            }
        }
    }
    Text(
        text = annotatedText,
        modifier = modifier,
        style = style.copy(color = color, fontWeight = fontWeight),
    )
}
