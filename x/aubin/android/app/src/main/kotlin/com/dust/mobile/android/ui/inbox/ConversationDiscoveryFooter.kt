package com.dust.mobile.android.ui.inbox

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant

@Composable
internal fun ConversationDiscoveryFooter(
    state: ConversationListState,
    onLoadMore: () -> Unit,
    onRetrySearch: () -> Unit,
) {
    val isSearch = state.searchText.isNotBlank()
    val isLoading = if (isSearch) state.search.isLoading else state.isLoadingMore
    val error = if (isSearch) state.search.error else state.loadMoreError
    val hasMore = if (isSearch) state.search.hasMore else state.hasMore
    if (!isLoading && error == null && !hasMore) return

    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        error?.let {
            Text(
                it,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        DustButton(
            label = when {
                error != null -> "Try again"
                isSearch && isLoading -> "Searching conversation titles…"
                isSearch -> "Search older conversations"
                isLoading -> "Loading older conversations…"
                else -> "Load older conversations"
            },
            loading = isLoading,
            modifier = Modifier.fillMaxWidth(),
            variant = DustButtonVariant.Text,
            onClick = if (isSearch && error != null && !state.search.retryLoadMore) onRetrySearch else onLoadMore,
        )
    }
}
