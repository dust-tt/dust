package com.dust.mobile.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.LoginScreen
import com.dust.mobile.android.ui.SESSION_EXPIRED_NOTICE
import com.dust.mobile.android.ui.theme.DustTheme

class DemoPresentationActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = intent.getStringExtra("screen") ?: "inbox"
        setContent {
            DustTheme {
                when (screen) {
                    "loading" -> DemoLoadingScreen()
                    "session-expired" -> LoginScreen(
                        onLogin = {},
                        onSignUp = {},
                        notice = SESSION_EXPIRED_NOTICE,
                    )
                    "empty-inbox" -> DemoEmptyInboxScreen()
                    "compose" -> DemoComposeScreen()
                    "detail" -> DemoDetailScreen()
                    "files" -> DemoFilesScreen()
                    else -> DemoInboxScreen()
                }
            }
        }
    }
}

@Composable
private fun DemoLoadingScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.dust_logo),
            contentDescription = null,
            modifier = Modifier.size(width = 112.dp, height = 28.dp),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "Loading Dust",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun DemoShell(
    title: String,
    subtitle: String,
    selectedNavigation: String? = null,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.dust_logo_square),
                contentDescription = null,
                modifier = Modifier.size(30.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    subtitle,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            action?.invoke()
            DemoAvatar("L", 30.dp)
        }
        content()
        selectedNavigation?.let { selected ->
            DemoPrimaryNavigation(selected = selected)
        }
    }
}

@Composable
private fun DemoInboxScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoRootHeader(showCatchUp = true)
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 16.dp),
        ) {
            item { DemoSection("Pods", uppercase = false) }
            item { DemoPodLink("Customer Ops") }
            item { DemoPodLink("Launch Planning") }
            item { DemoSection("Needs attention") }
            item {
                DemoConversationRow(
                    avatar = "S",
                    title = "Prepare the Q3 customer briefing",
                    snippet = "Pulled the latest account notes and drafted the customer-ready summary.",
                    badge = "Action required",
                    meta = "8 replies",
                )
            }
            item {
                DemoConversationRow(
                    avatar = "L",
                    title = "Coordinate launch follow-ups",
                    snippet = "Collected open questions, owners, and next steps before the customer call.",
                    badge = "Unread",
                    meta = "3 replies",
                )
            }
            item { DemoSection("Yesterday") }
            item {
                DemoConversationRow(
                    avatar = "M",
                    title = "Summarize workspace changes",
                    snippet = "The weekly update is ready with engineering, support, and product highlights.",
                    meta = "12 replies",
                )
            }
        }
        DemoListBottomBar()
    }
}

@Composable
private fun DemoEmptyInboxScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoRootHeader(showCatchUp = false)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.dust_logo_square),
                contentDescription = null,
                modifier = Modifier.size(52.dp),
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "No conversations yet",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Nothing needs attention right now.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        DemoListBottomBar()
    }
}

@Composable
private fun DemoRootHeader(showCatchUp: Boolean) {
    Column(
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DemoAvatar("L", 30.dp)
            Spacer(Modifier.size(10.dp))
            Text(
                "Lea Martin",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
            )
            DemoWorkspaceChip("Revenue Team")
            DemoToolbarIconButton(
                iconRes = R.drawable.ic_refresh_24,
                contentDescription = "Refresh conversations",
            )
        }
        if (showCatchUp) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_inbox_24),
                        contentDescription = null,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text("Catch Up", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
private fun DemoPodLink(label: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_space_open_24),
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun DemoListBottomBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(48.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_search_24),
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Search conversations",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        DemoCircleIconButton(
            iconRes = R.drawable.ic_chat_plus_24,
            contentDescription = "New conversation",
            size = 48.dp,
        )
    }
}

@Composable
private fun DemoInboxControls(catchUpCount: Int? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 20.dp, top = 2.dp, end = 20.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DemoWorkspaceChip("Revenue Team")
        Spacer(Modifier.weight(1f))
        if (catchUpCount != null) {
            Button(
                modifier = Modifier.height(36.dp),
                onClick = {},
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp),
                shape = RoundedCornerShape(18.dp),
            ) {
                Text("Catch up ($catchUpCount)")
            }
        }
        DemoIconButton(
            iconRes = R.drawable.ic_refresh_24,
            contentDescription = "Refresh conversations",
        )
    }
}

@Composable
private fun DemoWorkspaceChip(label: String) {
    Surface(
        modifier = Modifier.height(34.dp),
        shape = RoundedCornerShape(17.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Icon(
                painter = painterResource(R.drawable.ic_expand_more_24),
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DemoConversationSearchField() {
    OutlinedTextField(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .padding(horizontal = 20.dp, vertical = 1.dp),
        value = "",
        onValueChange = {},
        placeholder = { Text("Search conversations") },
        shape = RoundedCornerShape(18.dp),
        singleLine = true,
    )
}

@Composable
private fun DemoPodsStrip() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(start = 20.dp, top = 4.dp, end = 20.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Pods",
            style = MaterialTheme.typography.labelLarge,
        )
        DemoPill("Customer Ops")
        DemoPill("Launch Planning")
        Text(
            "Hide",
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DemoComposeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader()
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.dust_logo_square),
                contentDescription = null,
                modifier = Modifier.size(48.dp),
            )
        }
        DemoComposerBar()
    }
}

@Composable
private fun DemoQuickStarts() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Quick starts", style = MaterialTheme.typography.titleSmall)
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DemoPill("Draft customer brief")
            DemoPill("Summarize updates")
        }
    }
}

@Composable
private fun DemoDetailScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(
            title = "Briefing",
            action = {
                DemoToolbarIconButton(
                    iconRes = R.drawable.ic_attach_file_24,
                    contentDescription = "Conversation files",
                )
            },
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
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
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            painter = painterResource(R.drawable.ic_document_24),
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.secondary,
                        )
                        Text("Briefing summary.md", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        DemoComposerBar()
    }
}

@Composable
private fun DemoFilesScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "Conversation Files")
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item { DemoSection("Documents") }
            item {
                DemoFileRow(
                    kind = "PDF",
                    title = "customer-briefing.pdf",
                    source = "Dust",
                    iconRes = R.drawable.ic_document_24,
                )
            }
            item {
                DemoFileRow(
                    kind = "Document",
                    title = "q3-account-notes.docx",
                    source = "Sales",
                    iconRes = R.drawable.ic_document_24,
                )
            }
            item { DemoSection("Images") }
            item {
                DemoFileRow(
                    kind = "Image",
                    title = "meeting-room-whiteboard.png",
                    source = "Customer Ops",
                    iconRes = R.drawable.ic_image_24,
                )
            }
            item { DemoSection("Frames") }
            item {
                DemoFileRow(
                    kind = "Frame",
                    title = "Briefing preview",
                    source = "Dust",
                    accent = true,
                    iconRes = R.drawable.ic_document_24,
                )
            }
        }
    }
}

@Composable
private fun DemoPushedHeader(
    title: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
    ) {
        IconButton(
            modifier = Modifier.align(Alignment.CenterStart),
            onClick = {},
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_arrow_back_24),
                contentDescription = "Back",
                modifier = Modifier.size(20.dp),
            )
        }
        title?.let {
            Text(
                it,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 64.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
        }
        action?.let {
            Box(modifier = Modifier.align(Alignment.CenterEnd)) {
                it()
            }
        }
    }
}

@Composable
private fun DemoComposerBar() {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 8.dp,
    ) {
        Column {
            Text(
                "Ask anything or call an agent with @",
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    modifier = Modifier.height(38.dp),
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        DemoAvatar("D", 18.dp)
                        Text("Dust", style = MaterialTheme.typography.labelLarge)
                        Icon(
                            painter = painterResource(R.drawable.ic_expand_more_24),
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                DemoCircleIconButton(
                    iconRes = R.drawable.ic_add_24,
                    contentDescription = "Add context",
                    size = 38.dp,
                )
                Spacer(Modifier.weight(1f))
                DemoCircleIconButton(
                    iconRes = R.drawable.ic_mic_24,
                    contentDescription = "Voice input",
                    size = 38.dp,
                )
            }
        }
    }
}

@Composable
private fun DemoToolbarIconButton(iconRes: Int, contentDescription: String) {
    IconButton(onClick = {}, modifier = Modifier.size(42.dp)) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = contentDescription,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DemoCircleIconButton(
    iconRes: Int,
    contentDescription: String,
    size: Dp,
) {
    Surface(
        modifier = Modifier.size(size),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun DemoPrimaryNavigation(selected: String) {
    NavigationBar(
        modifier = Modifier.height(74.dp),
        containerColor = MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp,
    ) {
        DemoPrimaryNavigationItem(
            label = "Inbox",
            iconRes = R.drawable.ic_inbox_24,
            selected = selected == "Inbox",
            modifier = Modifier.weight(1f),
        )
        DemoPrimaryNavigationItem(
            label = "New",
            iconRes = R.drawable.ic_add_24,
            selected = selected == "New",
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun DemoPrimaryNavigationItem(
    label: String,
    iconRes: Int,
    selected: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val contentColor = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        }
        Box(
            modifier = Modifier
                .size(width = 52.dp, height = 28.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(
                    if (selected) {
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                    } else {
                        Color.Transparent
                    },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = contentColor,
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = contentColor,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DemoAttachmentActions() {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("Attachments", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DemoIconButton(iconRes = R.drawable.ic_image_24, contentDescription = "Add photos")
            DemoIconButton(iconRes = R.drawable.ic_attach_file_24, contentDescription = "Add files")
        }
    }
}

@Composable
private fun DemoIconButton(iconRes: Int, contentDescription: String) {
    Surface(
        modifier = Modifier.size(44.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.Transparent,
        contentColor = MaterialTheme.colorScheme.primary,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        IconButton(onClick = {}, modifier = Modifier.fillMaxSize()) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = contentDescription,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun DemoFileRow(
    kind: String,
    title: String,
    source: String,
    iconRes: Int = R.drawable.ic_attach_file_24,
    accent: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(28.dp),
            tint = if (accent) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(Modifier.weight(1f)) {
            Text(
                title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                "by $source",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (accent) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_right_24),
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DemoSection(label: String, uppercase: Boolean = true) {
    Text(
        if (uppercase) label.uppercase() else label,
        modifier = Modifier.padding(start = 12.dp, top = 16.dp, end = 12.dp, bottom = 4.dp),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun DemoConversationRow(
    avatar: String,
    title: String,
    snippet: String,
    badge: String? = null,
    meta: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        DemoAvatar(avatar, 32.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                badge?.let {
                    Box(
                        Modifier
                            .size(8.dp)
                            .background(
                                if (it == "Action required") Color(0xFFFFBE2C) else MaterialTheme.colorScheme.secondary,
                                CircleShape,
                            ),
                    )
                }
                Text(
                    title,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
            }
            Text(
                snippet,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(meta, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DemoMessageBubble(speaker: String, text: String, user: Boolean) {
    if (user) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth(0.82f),
                color = MaterialTheme.colorScheme.surfaceVariant,
                contentColor = MaterialTheme.colorScheme.onSurface,
                shape = RoundedCornerShape(16.dp),
            ) {
                Text(
                    text,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DemoAvatar(speaker.take(1), 28.dp)
                Text("@$speaker", style = MaterialTheme.typography.labelMedium)
            }
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun DemoPill(label: String, accent: Boolean = false) {
    val shape = RoundedCornerShape(999.dp)
    Surface(
        border = if (accent) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = if (accent) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
        } else {
            MaterialTheme.colorScheme.background
        },
        contentColor = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        shape = shape,
    ) {
        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp), style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun DemoAvatar(label: String, size: Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}
