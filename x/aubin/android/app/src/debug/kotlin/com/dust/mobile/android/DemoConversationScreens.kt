package com.dust.mobile.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.dust.mobile.android.ui.common.ComposerBarSkeleton
import com.dust.mobile.android.ui.common.ConversationDetailSkeleton
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.LoadingPlaceholder
import com.dust.mobile.android.ui.composer.ComposeAgentIntro
import com.dust.mobile.android.ui.preview.localPreviewAgents
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.interactiveSurface

@Composable
internal fun DemoDetailLoadingScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "Conversation")
        ConversationDetailSkeleton(Modifier.weight(1f))
        ComposerBarSkeleton()
    }
}

@Composable
internal fun DemoFrameLoadingScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "Frame")
        LoadingPlaceholder(
            iconRes = R.drawable.ic_frame_24,
            label = "Loading Frame",
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
internal fun DemoComposeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "New conversation")
        ComposeAgentIntro(
            agent = localPreviewAgents().first(),
            isLoading = false,
            modifier = Modifier.weight(1f),
        )
        DemoComposerBar()
    }
}

@Composable
internal fun DemoDetailScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(
            title = "Briefing",
            action = {
                DustIconButton(
                    iconRes = R.drawable.ic_folder_24,
                    contentDescription = "Open files and Frames",
                    onClick = {},
                )
            },
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(
                horizontal = DustSpacing.large,
                vertical = DustSpacing.medium,
            ),
            verticalArrangement = Arrangement.spacedBy(DustSpacing.medium),
        ) {
            item {
                DemoMessageBubble(
                    speaker = "Lea",
                    text = "Can you prepare a concise briefing for tomorrow's customer call?",
                    user = true,
                )
            }
            item {
                DemoMessageBubble(
                    speaker = "Dust",
                    text = "I found the latest account notes, grouped the open risks, and drafted a briefing with next steps.",
                    user = false,
                )
            }
            item {
                Surface(
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(DustRadii.control),
                    color = MaterialTheme.colorScheme.interactiveSurface,
                ) {
                    Row(
                        modifier = Modifier.padding(
                            horizontal = DustSpacing.medium,
                            vertical = DustSpacing.small,
                        ),
                        horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_document_24),
                            contentDescription = null,
                            modifier = Modifier.size(DustSpacing.large),
                            tint = MaterialTheme.colorScheme.action,
                        )
                        Text("Briefing summary.md", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        DemoComposerBar(showNewConversation = true)
    }
}

@Composable
internal fun DemoFilesScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "Conversation files")
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = DustSpacing.extraLarge),
        ) {
            item { DemoSection("Documents") }
            item { DemoFileRow("customer-briefing.pdf", "Dust", R.drawable.ic_document_24) }
            item { DemoFileRow("q3-account-notes.docx", "Sales", R.drawable.ic_document_24) }
            item { DemoSection("Images") }
            item { DemoFileRow("meeting-room-whiteboard.png", "Customer Ops", R.drawable.ic_image_24) }
            item { DemoSection("Frames") }
            item {
                DemoFileRow(
                    title = "Briefing preview",
                    source = "Dust",
                    iconRes = R.drawable.ic_frame_24,
                    accent = true,
                )
            }
        }
    }
}
