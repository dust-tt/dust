package com.dust.mobile.android.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun ConversationListSkeleton(modifier: Modifier = Modifier) {
    val alpha = loadingPulseAlpha()
    ConversationRowsSkeleton(
        alpha = alpha,
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .semantics { contentDescription = "Loading conversations" },
        rowCount = 7,
        showPods = true,
        topPadding = 8.dp,
    )
}

@Composable
internal fun ConversationRowsSkeleton(
    alpha: Float = loadingPulseAlpha(),
    modifier: Modifier = Modifier,
    rowCount: Int = 5,
    showPods: Boolean = false,
    podsExpanded: Boolean = false,
    topPadding: Dp = 0.dp,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        userScrollEnabled = false,
        contentPadding = PaddingValues(top = topPadding, bottom = 16.dp),
    ) {
        if (showPods) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainerLow)
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SkeletonBlock(alpha, Modifier.size(15.dp), RoundedCornerShape(3.dp))
                    SkeletonBlock(alpha, Modifier.size(width = 48.dp, height = 10.dp))
                    SkeletonBlock(alpha, Modifier.size(width = 14.dp, height = 10.dp))
                    Spacer(Modifier.weight(1f))
                    SkeletonBlock(alpha, Modifier.size(10.dp), RoundedCornerShape(3.dp))
                }
            }
            if (podsExpanded) {
                repeat(2) { index ->
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp)
                                .background(MaterialTheme.colorScheme.surfaceContainerLow)
                                .padding(start = 40.dp, end = 16.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SkeletonBlock(alpha, Modifier.size(14.dp), RoundedCornerShape(3.dp))
                            SkeletonBlock(
                                alpha,
                                Modifier.size(
                                    width = if (index == 0) 112.dp else 132.dp,
                                    height = 12.dp,
                                ),
                            )
                        }
                    }
                }
            }
        }
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonBlock(alpha, Modifier.size(width = 72.dp, height = 11.dp))
                SkeletonBlock(
                    alpha,
                    Modifier
                        .padding(start = 8.dp)
                        .size(width = 12.dp, height = 9.dp),
                )
            }
        }
        repeat(rowCount) { index ->
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier.width(20.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        SkeletonBlock(
                            alpha,
                            Modifier.size(if (index % 3 == 0) 8.dp else 16.dp),
                            if (index % 3 == 0) {
                                RoundedCornerShape(8.dp)
                            } else {
                                RoundedCornerShape(4.dp)
                            },
                        )
                    }
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        SkeletonBlock(
                            alpha,
                            Modifier
                                .fillMaxWidth(if (index % 2 == 0) 0.7f else 0.58f)
                                .height(14.dp),
                        )
                        SkeletonBlock(
                            alpha,
                            Modifier.size(
                                width = if (index % 2 == 0) 118.dp else 88.dp,
                                height = 11.dp,
                            ),
                        )
                    }
                    SkeletonBlock(alpha, Modifier.size(width = 28.dp, height = 9.dp))
                }
                HorizontalDivider(
                    modifier = Modifier.padding(start = 44.dp, end = 16.dp),
                    color = MaterialTheme.colorScheme.subtleBorder.copy(alpha = 0.72f),
                )
            }
        }
    }
}

@Composable
internal fun ConversationDetailSkeleton(modifier: Modifier = Modifier) {
    val alpha = loadingPulseAlpha()
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        userScrollEnabled = false,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End,
            ) {
                SkeletonBlock(
                    alpha,
                    Modifier
                        .fillMaxWidth(0.72f)
                        .height(54.dp),
                    RoundedCornerShape(16.dp),
                )
            }
        }
        item {
            Column {
                SkeletonAgentHeader(alpha)
                Spacer(Modifier.height(10.dp))
                Column(Modifier.padding(start = 34.dp)) {
                    SkeletonTextLines(alpha, listOf(0.94f, 0.78f, 0.56f))
                }
            }
        }
        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End,
            ) {
                SkeletonBlock(
                    alpha,
                    Modifier
                        .fillMaxWidth(0.58f)
                        .height(42.dp),
                    RoundedCornerShape(16.dp),
                )
            }
        }
    }
}

@Composable
internal fun SkeletonAgentHeader(alpha: Float) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SkeletonBlock(alpha, Modifier.size(26.dp), RoundedCornerShape(6.dp))
        SkeletonBlock(alpha, Modifier.size(width = 72.dp, height = 12.dp))
        SkeletonBlock(alpha, Modifier.size(width = 44.dp, height = 9.dp))
    }
}

@Composable
internal fun SkeletonTextLines(alpha: Float, widths: List<Float>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        widths.forEach { width ->
            SkeletonBlock(
                alpha,
                Modifier
                    .fillMaxWidth(width)
                    .height(14.dp),
            )
        }
    }
}
