package com.dust.mobile.android.shortcuts

import androidx.core.content.pm.ShortcutManagerCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.dust.mobile.android.DustApplication
import com.dust.mobile.android.notifications.ConversationNotificationShortcutPublisher
import com.dust.mobile.android.notifications.DustNotificationPayload
import com.dust.mobile.android.notifications.DustNotificationType
import com.dust.mobile.android.ui.preview.localPreviewAgents
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShortcutPublishingInstrumentedTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val application = context.applicationContext as DustApplication
    private val agentPublisher = AgentShortcutPublisher(
        context,
        application.graph.persistedStateStore,
    )
    private val conversationPublisher = ConversationNotificationShortcutPublisher(context)

    @Before
    fun clearShortcuts() {
        agentPublisher.clear()
        conversationPublisher.clear()
    }

    @After
    fun cleanUpShortcuts() {
        agentPublisher.clear()
        conversationPublisher.clear()
    }

    @Test
    fun publishesAgentAsAndroidDirectShareShortcut() = runBlocking {
        val agent = localPreviewAgents().first()

        agentPublisher.publish("workspace-1", listOf(agent))

        assertTrue(dynamicShortcutIds().contains("agent:workspace-1:${agent.sId}"))
    }

    @Test
    fun publishesHumanConversationAsLongLivedAndroidShortcut() {
        val shortcutId = conversationPublisher.publish(
            DustNotificationPayload(
                type = DustNotificationType.CONVERSATION_UNREAD,
                workspaceId = "workspace-1",
                conversationId = "conversation-1",
                messageId = "message-1",
                actionId = null,
                conversationTitle = "Customer briefing",
                authorName = "Ada Lovelace",
                authorIsAgent = false,
                isMention = false,
                title = "Customer briefing",
                body = "Can you review the latest changes?",
                sentAtMillis = 1L,
                authorUserId = "user-1",
            ),
        )

        assertTrue(shortcutId != null && dynamicShortcutIds().contains(shortcutId))
    }

    private fun dynamicShortcutIds(): Set<String> =
        ShortcutManagerCompat.getDynamicShortcuts(context).mapTo(mutableSetOf()) { it.id }
}
