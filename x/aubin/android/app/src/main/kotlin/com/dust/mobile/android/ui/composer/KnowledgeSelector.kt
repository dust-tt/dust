package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustSearchField
import com.dust.mobile.android.ui.common.SkeletonBlock
import com.dust.mobile.android.ui.common.loadingPulseAlpha
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.selectableKnowledgeItems

@Composable
internal fun KnowledgeSelector(
    query: String,
    results: List<KnowledgeItem>,
    selected: List<KnowledgeItem>,
    isSearching: Boolean,
    onQueryChange: (String) -> Unit,
    onToggle: (KnowledgeItem) -> Unit,
    focusRequester: FocusRequester? = null,
    modifier: Modifier = Modifier,
) {
    val selectableResults = remember(results, selected) {
        selectableKnowledgeItems(results, selected)
    }
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(DustSpacing.medium),
    ) {
        DustSearchField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = if (isSearching) "Searching..." else "Search documents...",
            modifier = Modifier.fillMaxWidth(),
            focusRequester = focusRequester,
        )
        when {
            query.length < 2 -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )
            isSearching && selectableResults.isEmpty() -> KnowledgeResultsSkeleton(
                modifier = Modifier.weight(1f),
            )
            selectableResults.isEmpty() -> Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "No results found",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.contentMuted,
                )
            }
            else -> LazyColumn(
                modifier = Modifier.weight(1f),
            ) {
                items(selectableResults.take(24), key = { it.id }) { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onToggle(item) }
                            .heightIn(min = DustDimensions.rowMinimumHeight)
                            .padding(vertical = DustSpacing.small),
                        horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_attach_file_24),
                            contentDescription = null,
                            modifier = Modifier.size(DustDimensions.contentIcon),
                            tint = MaterialTheme.colorScheme.contentMuted,
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
                        ) {
                            Text(
                                item.title,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.contentStrong,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            knowledgeItemMetadataLabel(item)?.let { subtitle ->
                                Text(
                                    subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.contentMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KnowledgeResultsSkeleton(modifier: Modifier = Modifier) {
    val alpha = loadingPulseAlpha()
    Column(
        modifier = modifier.fillMaxWidth(),
    ) {
        repeat(3) { index ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = DustDimensions.rowMinimumHeight)
                    .padding(vertical = DustSpacing.small),
                horizontalArrangement = Arrangement.spacedBy(DustSpacing.medium),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonBlock(alpha, Modifier.size(24.dp), RoundedCornerShape(5.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
                ) {
                    SkeletonBlock(
                        alpha,
                        Modifier
                            .fillMaxWidth(if (index == 1) 0.62f else 0.78f)
                            .height(13.dp),
                    )
                    SkeletonBlock(alpha, Modifier.size(width = 96.dp, height = 10.dp))
                }
            }
        }
    }
}

internal fun knowledgeItemMetadataLabel(item: KnowledgeItem): String? =
    listOfNotNull(
        item.connectorProvider?.toKnowledgeMetadataLabel(),
        item.nodeType?.toKnowledgeMetadataLabel(),
    ).joinToString(" · ").takeIf { it.isNotBlank() }

private fun String.toKnowledgeMetadataLabel(): String? {
    val key = trim()
        .lowercase()
        .replace('-', '_')
        .replace(' ', '_')
        .replace(Regex("_+"), "_")
        .trim('_')
    if (key.isEmpty()) return null

    return when (key) {
        "google_drive" -> "Google Drive"
        "github" -> "GitHub"
        "microsoft_sharepoint", "microsoft_share_point" -> "Microsoft SharePoint"
        "microsoft_teams" -> "Microsoft Teams"
        "url" -> "URL"
        else -> key
            .split('_')
            .joinToString(" ") { word -> word.replaceFirstChar(Char::titlecase) }
    }
}
