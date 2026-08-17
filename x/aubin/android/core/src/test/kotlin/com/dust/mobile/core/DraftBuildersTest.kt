package com.dust.mobile.core

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.BlockedAction
import com.dust.mobile.core.model.BlockedActionStatus
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.ConversationAttachment
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.CreateMessagePayload
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.ToolApprovalMetadata
import com.dust.mobile.core.model.contentWithSkillTags
import com.dust.mobile.core.model.nextBlockedActionStreamMessageId
import com.dust.mobile.core.model.reconciledBlockedState
import com.dust.mobile.core.model.selectedToolIds
import com.dust.mobile.core.model.toBlockedState
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftBuildersTest {
    @Test
    fun `contentWithSkillTags appends selected skill tags`() {
        val content = contentWithSkillTags(
            content = "Summarize this",
            capabilities = listOf(
                Capability.SkillCapability(Skill(sId = "sk_123", name = "Research", icon = "book")),
            ),
        )

        assertEquals(
            "Summarize this\n<skill id=\"sk_123\" name=\"Research\" icon=\"book\" />",
            content,
        )
    }

    @Test
    fun `selectedToolIds ignores skills`() {
        val tool = Capability.Tool(
            MCPServerView(
                sId = "sv_1",
                spaceId = "sp_1",
                server = MCPServer(sId = "s_1", name = "github", description = "GitHub"),
            ),
        )

        assertEquals(
            listOf("sv_1"),
            selectedToolIds(
                listOf(
                    tool,
                    Capability.SkillCapability(Skill(sId = "sk_1", name = "Skill")),
                ),
            ),
        )
    }

    @Test
    fun `create conversation request encodes Swift-compatible nulls and content fragments`() {
        val request = CreateConversationRequest(
            spaceId = null,
            message = CreateMessagePayload(
                content = "hello",
                mentions = listOf(MentionPayload(configurationId = "dust")),
                context = MessageContext(timezone = "Europe/Paris", profilePictureUrl = null),
            ),
            contentFragments = listOf(
                ContentFragmentPayload.file(
                    title = "brief.pdf",
                    fileId = "file_123",
                    context = ContentFragmentContext(profilePictureUrl = null),
                ),
            ),
        )

        val encoded = DustJson.encodeToString(request)

        assertEquals(
            """{"title":null,"visibility":"unlisted","spaceId":null,"message":{"content":"hello","mentions":[{"configurationId":"dust"}],"context":{"timezone":"Europe/Paris","profilePictureUrl":null}},"contentFragments":[{"title":"brief.pdf","fileId":"file_123","context":{"profilePictureUrl":null}}]}""",
            encoded,
        )
        assertFalse(encoded.contains("\"nodeId\""))
        assertFalse(encoded.contains("\"nodeDataSourceViewId\""))
        assertFalse(encoded.contains("\"url\""))
        assertFalse(encoded.contains("\"selectedMCPServerViewIds\""))
    }

    @Test
    fun `message context encodes selected tool ids when present`() {
        val encoded = DustJson.encodeToString(
            MessageContext(
                timezone = "Europe/Paris",
                profilePictureUrl = "avatar.png",
                selectedMCPServerViewIds = listOf("sv_1"),
            ),
        )

        assertEquals(
            """{"timezone":"Europe/Paris","profilePictureUrl":"avatar.png","selectedMCPServerViewIds":["sv_1"]}""",
            encoded,
        )
    }

    @Test
    fun `conversation attachment derives category without sId`() {
        val attachment = DustJson.decodeFromString<ConversationAttachment>(
            """
            {
              "fileId": "file_123",
              "title": "chart.png",
              "contentType": "image/png",
              "sourceUrl": null,
              "source": "agent"
            }
            """.trimIndent(),
        )

        assertEquals("file_123", attachment.id)
        assertTrue(attachment.isImage)
        assertEquals("Images", attachment.category.displayName)
    }

    @Test
    fun `blocked validation action maps to approval state`() {
        val blocked = BlockedAction(
            status = BlockedActionStatus.BLOCKED_VALIDATION_REQUIRED,
            conversationId = "c1",
            messageId = "m1",
            actionId = "a1",
            stake = "low",
            metadata = ToolApprovalMetadata(toolName = "search", mcpServerName = "github", agentName = "Dust"),
        )

        val state = blocked.toBlockedState("fallback")

        val approval = (state as BlockedState.Approval).approval
        assertEquals("a1", approval.actionId)
        assertEquals("m1", approval.messageId)
        assertEquals("c1", approval.conversationId)
        assertTrue(approval.canAlwaysAllow)
    }

    @Test
    fun `reconciledBlockedState keeps current state when blocked action is not displayable`() {
        val current = BlockedState.PersonalAuth(provider = "GitHub", toolName = "search")
        val blocked = BlockedAction(status = BlockedActionStatus.BLOCKED_CHILD_ACTION_INPUT_REQUIRED)

        assertEquals(
            current,
            reconciledBlockedState(
                currentBlockedState = current,
                blockedAction = blocked,
                fallbackConversationId = "fallback",
            ),
        )
    }

    @Test
    fun `blocked action stream starts only when no stream is tracked`() {
        assertEquals(
            "m1",
            nextBlockedActionStreamMessageId(
                currentStreamingMessageId = null,
                blockedActionMessageId = "m1",
            ),
        )

        assertNull(
            nextBlockedActionStreamMessageId(
                currentStreamingMessageId = "m1",
                blockedActionMessageId = "m1",
            ),
        )

        assertNull(
            nextBlockedActionStreamMessageId(
                currentStreamingMessageId = "m1",
                blockedActionMessageId = "m2",
            ),
        )
    }
}
