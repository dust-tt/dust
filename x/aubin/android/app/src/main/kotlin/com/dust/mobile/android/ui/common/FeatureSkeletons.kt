package com.dust.mobile.android.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun ComposerBarSkeleton() {
    val alpha = loadingPulseAlpha()
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .height(92.dp),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            SkeletonBlock(alpha, Modifier.size(width = 220.dp, height = 14.dp))
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(3) {
                    SkeletonBlock(alpha, Modifier.size(32.dp), RoundedCornerShape(8.dp))
                }
                Spacer(Modifier.weight(1f))
                SkeletonBlock(alpha, Modifier.size(36.dp), RoundedCornerShape(8.dp))
            }
        }
    }
}

@Composable
internal fun AgentProfileSkeleton() {
    val alpha = loadingPulseAlpha()
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SkeletonBlock(alpha, Modifier.size(40.dp), RoundedCornerShape(8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SkeletonBlock(alpha, Modifier.size(width = 88.dp, height = 14.dp))
            SkeletonBlock(alpha, Modifier.size(width = 200.dp, height = 12.dp))
        }
    }
}

@Composable
internal fun CatchUpMessagesSkeleton() {
    val alpha = loadingPulseAlpha()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 16.dp, top = 64.dp, end = 16.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        SkeletonAgentHeader(alpha)
        SkeletonTextLines(alpha, listOf(0.88f, 0.7f, 0.54f))
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            SkeletonBlock(
                alpha,
                Modifier
                    .fillMaxWidth(0.72f)
                    .height(62.dp),
                RoundedCornerShape(16.dp),
            )
        }
    }
}

@Composable
internal fun ConversationFilesSkeleton() {
    val alpha = loadingPulseAlpha()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        userScrollEnabled = false,
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonBlock(alpha, Modifier.size(width = 72.dp, height = 10.dp))
            }
        }
        repeat(5) { index ->
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SkeletonBlock(alpha, Modifier.size(28.dp), RoundedCornerShape(6.dp))
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        SkeletonBlock(
                            alpha,
                            Modifier
                                .fillMaxWidth(if (index % 2 == 0) 0.7f else 0.56f)
                                .height(14.dp),
                        )
                        SkeletonBlock(alpha, Modifier.size(width = 72.dp, height = 10.dp))
                    }
                }
            }
        }
    }
}

@Composable
internal fun AttachmentViewerSkeleton() {
    val alpha = loadingPulseAlpha()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SkeletonBlock(
            alpha,
            Modifier
                .fillMaxWidth()
                .height(220.dp),
            RoundedCornerShape(8.dp),
        )
        SkeletonTextLines(alpha, listOf(0.9f, 0.82f, 0.68f, 0.76f))
    }
}
