package com.dust.mobile.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.dust.mobile.android.ui.inbox.ConversationFocusSectionHeader
import com.dust.mobile.android.ui.inbox.ConversationRow
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.Conversation

@Composable
internal fun DemoInboxScreen() {
    val nowMs = remember { System.currentTimeMillis() }
    val focus = remember(nowMs) {
        listOf(
            demoConversation(
                id = "briefing",
                title = "Prepare the Q3 customer briefing",
                updated = nowMs - 12 * 60_000,
                unread = true,
                actionRequired = true,
                spaceId = "customer-ops",
            ),
            demoConversation(
                id = "launch",
                title = "Coordinate launch follow-ups",
                updated = nowMs - 60 * 60_000,
                unread = true,
                spaceId = "launch-planning",
            ),
        )
    }
    val recent = remember(nowMs) {
        listOf(
            demoConversation(
                id = "review",
                title = "Draft the account review",
                updated = nowMs,
                isRunning = true,
                spaceId = "customer-ops",
            ),
            demoConversation(
                id = "weekly",
                title = "Summarize workspace changes",
                updated = nowMs - 18 * 60_000,
                nextWakeupAt = nowMs + 24 * 60 * 60_000,
            ),
            demoConversation(
                id = "research",
                title = "Research onboarding examples",
                updated = nowMs - 24 * 60 * 60_000,
                triggerId = "trigger",
            ),
        )
    }
    val podNames = mapOf(
        "customer-ops" to "Customer Ops",
        "launch-planning" to "Launch Planning",
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoRootHeader()
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = DustSpacing.large),
        ) {
            item { DemoPodsHeader(count = 2) }
            item {
                ConversationFocusSectionHeader(
                    label = "Needs you",
                    count = focus.size,
                    onCatchUp = {},
                )
            }
            items(focus, key = { it.sId }) { conversation ->
                DemoFocusConversationRow(conversation, podNames[conversation.spaceId])
            }
            item { ConversationFocusSectionHeader(label = "Recent", count = recent.size) }
            items(recent, key = { it.sId }) { conversation ->
                DemoFocusConversationRow(conversation, podNames[conversation.spaceId])
            }
        }
        DemoListBottomBar(showCatchUp = false)
    }
}

@Composable
private fun DemoFocusConversationRow(conversation: Conversation, podName: String?) {
    ConversationRow(
        conversation = conversation,
        podName = podName,
        showActions = false,
        onOpen = {},
        onToggleRead = {},
        onDelete = {},
    )
}

private fun demoConversation(
    id: String,
    title: String,
    updated: Long,
    unread: Boolean = false,
    actionRequired: Boolean = false,
    isRunning: Boolean = false,
    spaceId: String? = null,
    nextWakeupAt: Long? = null,
    triggerId: String? = null,
): Conversation = Conversation(
    sId = id,
    created = updated.toDouble(),
    updated = updated.toDouble(),
    title = title,
    unread = unread,
    actionRequired = actionRequired,
    isRunningAgentLoop = isRunning,
    spaceId = spaceId,
    nextWakeupAt = nextWakeupAt?.toDouble(),
    triggerId = triggerId,
)
