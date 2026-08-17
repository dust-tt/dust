package com.dust.mobile.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.conversation.detail.ConversationScrollEffects
import com.dust.mobile.android.ui.conversation.detail.conversationMessageTopSpacing
import com.dust.mobile.android.ui.message.MessageBubble
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.UserMessageContext
import com.dust.mobile.core.stream.AgentMessageStream
import kotlinx.coroutines.delay

@Composable
internal fun DemoStreamingScreen(holdThinking: Boolean = false) {
    val created = remember { System.currentTimeMillis().toDouble() }
    var thinking by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var status by remember { mutableStateOf(AgentMessageStatus.CREATED) }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        delay(600)
        STREAMING_DEMO_THINKING_CHUNKS.forEach { chunk ->
            thinking += chunk
            delay(170)
        }
        if (holdThinking) return@LaunchedEffect
        STREAMING_DEMO_CHUNKS.forEach { chunk ->
            content += chunk
            delay(110)
        }
        delay(700)
        status = AgentMessageStatus.SUCCEEDED
    }

    val message = ConversationMessage.Agent(
        AgentMessage(
            sId = "demo-stream",
            type = MessageType.AGENT,
            created = created,
            visibility = "visible",
            version = 0,
            rank = 1,
            status = status,
            content = content,
            chainOfThought = thinking.takeIf { status == AgentMessageStatus.CREATED && content.isBlank() },
            configuration = AgentConfiguration(
                sId = "dust",
                name = "Dust",
            ),
        ),
    )
    val priorMessages = remember(created) { demoPriorMessages(created) }
    val messages = priorMessages + message
    ConversationScrollEffects(
        conversationId = "streaming-demo",
        messageCount = messages.size,
        lastMessageId = message.id,
        hasMore = false,
        streamingMessageId = message.id.takeIf { status == AgentMessageStatus.CREATED },
        isComposerFocused = false,
        isSending = false,
        listState = listState,
        onUserScroll = {},
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding(),
    ) {
        DemoPushedHeader(title = "Streaming")
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(
                horizontal = DustSpacing.large,
                vertical = DustSpacing.medium,
            ),
        ) {
            itemsIndexed(messages, key = { _, item -> item.id }) { index, item ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            top = conversationMessageTopSpacing(
                                previousMessage = messages.getOrNull(index - 1),
                                message = item,
                                hidesAgentHeader = false,
                            ),
                        ),
                ) {
                    MessageBubble(
                        message = item,
                        currentUserEmail = "lea@dust.tt",
                        streamingActivity = if (
                            item.id == message.id && status == AgentMessageStatus.CREATED
                        ) {
                            if (content.isBlank()) {
                                AgentMessageStream.Activity.THINKING
                            } else {
                                AgentMessageStream.Activity.GENERATING
                            }
                        } else {
                            null
                        },
                    )
                }
            }
            item(key = "conversation-bottom-anchor") {
                Spacer(Modifier.height(1.dp))
            }
        }
        DemoComposerBar(showNewConversation = true)
    }
}

private fun demoPriorMessages(created: Double): List<ConversationMessage> = listOf(
    ConversationMessage.User(
        UserMessage(
            id = 1,
            sId = "demo-user-1",
            type = MessageType.USER,
            created = created - 180_000,
            visibility = "visible",
            version = 0,
            rank = 0,
            content = "What are the main rollout risks we should monitor?",
            context = UserMessageContext(fullName = "Lea", email = "lea@dust.tt"),
        ),
    ),
    ConversationMessage.Agent(
        AgentMessage(
            sId = "demo-agent-1",
            type = MessageType.AGENT,
            created = created - 120_000,
            visibility = "visible",
            version = 0,
            rank = 1,
            status = AgentMessageStatus.SUCCEEDED,
            content = "The main risks are ownership gaps, the security review timeline, and keeping the enablement plan aligned with rollout milestones.",
            configuration = AgentConfiguration(sId = "dust", name = "Dust"),
        ),
    ),
    ConversationMessage.User(
        UserMessage(
            id = 2,
            sId = "demo-user-2",
            type = MessageType.USER,
            created = created - 60_000,
            visibility = "visible",
            version = 0,
            rank = 2,
            content = "Summarize what changed in the customer account this week.",
            context = UserMessageContext(fullName = "Lea", email = "lea@dust.tt"),
        ),
    ),
)

private val STREAMING_DEMO_CHUNKS = listOf(
    "I reviewed ",
    "the latest account notes ",
    "and support updates.",
    "\n\n**This week**\n",
    "- The rollout is on schedule.\n",
    "- Two open questions need owners.\n",
    "- The customer asked for a short enablement session.\n",
    "- Procurement confirmed the security review timeline.\n",
    "- Product usage increased across the operations team.",
    "\n\n**Next steps**\n",
    "- Assign owners to the two open questions.\n",
    "- Send the customer the enablement agenda.\n",
    "- Confirm rollout metrics before Friday.\n",
    "- Share the final briefing with the account team.\n",
    "- Schedule the next executive check-in.",
    "\n\nThe account remains on track, with clear owners needed for the remaining follow-ups.",
)

private val STREAMING_DEMO_THINKING_CHUNKS = listOf(
    "Reviewing the latest account notes and support updates. ",
    "I am comparing rollout milestones with the open customer questions. ",
    "The main themes are ownership, enablement, procurement, and usage growth. ",
    "I will organize the answer into this week's changes and concrete next steps. ",
    "Before writing, I am checking that every follow-up has a clear owner and deadline.",
)
