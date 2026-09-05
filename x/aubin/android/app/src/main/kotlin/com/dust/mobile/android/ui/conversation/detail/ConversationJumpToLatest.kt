package com.dust.mobile.android.ui.conversation.detail

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import kotlinx.coroutines.launch

@Composable
internal fun ConversationJumpToLatest(
    listState: LazyListState,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val thresholdPx = with(LocalDensity.current) { 96.dp.roundToPx() }
    val isAwayFromLatest by remember(listState, thresholdPx) {
        derivedStateOf {
            val layout = listState.layoutInfo
            val lastVisible = layout.visibleItemsInfo.lastOrNull()
            listState.canScrollForward && !isNearStreamingBottom(
                lastVisibleItemIndex = lastVisible?.index,
                lastVisibleItemEndOffset = lastVisible?.let { it.offset + it.size },
                viewportEndOffset = layout.viewportEndOffset,
                bottomAnchorIndex = layout.totalItemsCount - 1,
                followThresholdPx = thresholdPx,
            )
        }
    }
    if (isAwayFromLatest) {
        DustButton(
            label = "Jump to latest",
            iconRes = R.drawable.ic_expand_more_24,
            variant = DustButtonVariant.Secondary,
            modifier = modifier,
            onClick = {
                scope.launch {
                    val lastIndex = listState.layoutInfo.totalItemsCount - 1
                    if (lastIndex >= 0) listState.scrollToItem(lastIndex)
                }
            },
        )
    }
}
