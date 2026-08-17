package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.ui.conversation.detail.ConversationDetailState
import com.dust.mobile.android.ui.conversation.detail.InlineActivityState
import com.dust.mobile.android.ui.conversation.detail.fallbackAgentMessageDoneStatus
import com.dust.mobile.android.ui.conversation.detail.shouldHandleAgentMessageDone
import com.dust.mobile.android.ui.conversation.detail.withAppliedStreamSnapshot
import com.dust.mobile.android.ui.conversation.detail.withClearedLiveStream
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.DEFAULT_AGENT_CONFIGURATION_ID
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.stream.AgentMessageStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ComposeStateTest {
    @Test
    fun `canSend waits for a selected agent and loaded options`() {
        val selectedAgent = agent("agent-1", "Other")

        assertFalse(ComposeState(text = "Hello").canSend)
        assertFalse(
            ComposeState(
                text = "Hello",
                selectedAgent = selectedAgent,
                isLoadingOptions = true,
            ).canSend,
        )
        assertTrue(ComposeState(text = "Hello", selectedAgent = selectedAgent).canSend)
    }

    @Test
    fun `skill references are sendable without additional text`() {
        val selectedAgent = agent("agent-1", "Other")
        val skill = Capability.SkillCapability(Skill(sId = "skill-1", name = "Writer"))

        assertTrue(
            ComposeState(
                selectedAgent = selectedAgent,
                selectedCapabilities = listOf(skill),
            ).canSend,
        )
        assertTrue(ConversationDetailState(selectedCapabilities = listOf(skill)).canSendReply)
        assertFalse(
            ComposeState(
                selectedAgent = selectedAgent,
                selectedCapabilities = listOf(
                    Capability.Tool(
                        MCPServerView(
                            sId = "tool-1",
                            name = "Browser",
                            spaceId = "space-1",
                            server = MCPServer(
                                sId = "server-1",
                                name = "Browser",
                                description = "Open web pages",
                            ),
                        ),
                    ),
                ),
            ).canSend,
        )
    }

    @Test
    fun `clearedDraft removes draft data and restores default agent`() {
        val defaultAgent = agent(DEFAULT_AGENT_CONFIGURATION_ID, "Dust")
        val otherAgent = agent("agent-1", "Other")
        val state = ComposeState(
            text = "draft",
            agents = listOf(otherAgent, defaultAgent),
            selectedAgent = otherAgent,
            selectedCapabilities = listOf(Capability.SkillCapability(Skill(sId = "skill-1", name = "Writer"))),
            knowledgeQuery = "handbook",
            knowledgeResults = listOf(knowledgeItem("node-1")),
            selectedKnowledgeItems = listOf(knowledgeItem("node-1")),
            attachments = listOf(
                AttachmentDraft(
                    id = "attachment-1",
                    fileName = "notes.txt",
                    contentType = "text/plain",
                    fileSize = 4,
                    data = byteArrayOf(1, 2, 3, 4),
                ),
            ),
            isSearchingKnowledge = true,
            isSending = true,
            error = "failed",
        )

        val cleared = state.clearedDraft()

        assertEquals("", cleared.text)
        assertEquals(defaultAgent, cleared.selectedAgent)
        assertTrue(cleared.attachments.isEmpty())
        assertTrue(cleared.selectedCapabilities.isEmpty())
        assertEquals("", cleared.knowledgeQuery)
        assertTrue(cleared.knowledgeResults.isEmpty())
        assertTrue(cleared.selectedKnowledgeItems.isEmpty())
        assertEquals(false, cleared.isSearchingKnowledge)
        assertEquals(false, cleared.isSending)
        assertNull(cleared.error)
    }

    @Test
    fun `sentSuccessfully clears sent draft data without changing selected agent`() {
        val selectedAgent = agent("agent-1", "Other")
        val state = ComposeState(
            text = "draft",
            selectedAgent = selectedAgent,
            selectedCapabilities = listOf(Capability.SkillCapability(Skill(sId = "skill-1", name = "Writer"))),
            knowledgeQuery = "handbook",
            knowledgeResults = listOf(knowledgeItem("node-1")),
            selectedKnowledgeItems = listOf(knowledgeItem("node-1")),
            attachments = listOf(
                AttachmentDraft(
                    id = "attachment-1",
                    fileName = "notes.txt",
                    contentType = "text/plain",
                    fileSize = 4,
                    data = byteArrayOf(1, 2, 3, 4),
                ),
            ),
            isSearchingKnowledge = true,
            isSending = true,
            error = "failed",
        )

        val sent = state.sentSuccessfully()

        assertEquals("", sent.text)
        assertEquals(selectedAgent, sent.selectedAgent)
        assertTrue(sent.attachments.isEmpty())
        assertTrue(sent.selectedCapabilities.isEmpty())
        assertEquals("", sent.knowledgeQuery)
        assertTrue(sent.knowledgeResults.isEmpty())
        assertTrue(sent.selectedKnowledgeItems.isEmpty())
        assertEquals(false, sent.isSearchingKnowledge)
        assertEquals(false, sent.isSending)
        assertNull(sent.error)
    }

    @Test
    fun `shouldHandleAgentMessageDone only handles active or still streaming messages`() {
        val state = ConversationDetailState(
            streamingMessageId = "m-current",
            messages = listOf(
                ConversationMessage.Agent(agentMessage("m-streaming", AgentMessageStatus.CREATED)),
                ConversationMessage.Agent(agentMessage("m-done", AgentMessageStatus.SUCCEEDED)),
            ),
        )

        assertTrue(state.shouldHandleAgentMessageDone("m-current"))
        assertTrue(state.copy(streamingMessageId = null).shouldHandleAgentMessageDone("m-streaming"))
        assertFalse(state.shouldHandleAgentMessageDone("m-done"))
        assertFalse(state.shouldHandleAgentMessageDone("m-missing"))
    }

    @Test
    fun `applied stream snapshot preserves committed thinking until terminal snapshot`() {
        val state = ConversationDetailState(
            messages = listOf(
                ConversationMessage.Agent(
                    agentMessage(
                        id = "m1",
                        status = AgentMessageStatus.CREATED,
                        content = "old",
                        chainOfThought = "Thinking",
                    ),
                ),
            ),
        )

        val updated = state.withAppliedStreamSnapshot(
            messageId = "m1",
            snapshot = AgentMessageStream.Snapshot(
                messageId = "m1",
                content = "   ",
                chainOfThought = null,
            ),
        )

        val message = updated.messages.single() as ConversationMessage.Agent
        assertEquals("   ", message.message.content)
        assertEquals("Thinking", message.message.chainOfThought)
    }

    @Test
    fun `terminal stream snapshot clears committed thinking when final message has none`() {
        val state = ConversationDetailState(
            messages = listOf(
                ConversationMessage.Agent(
                    agentMessage(
                        id = "m1",
                        status = AgentMessageStatus.CREATED,
                        chainOfThought = "Thinking",
                    ),
                ),
            ),
        )

        val updated = state.withAppliedStreamSnapshot(
            messageId = "m1",
            snapshot = AgentMessageStream.Snapshot(
                messageId = "m1",
                content = "Answer",
                chainOfThought = null,
                status = AgentMessageStatus.SUCCEEDED,
            ),
        )

        val message = updated.messages.single() as ConversationMessage.Agent
        assertEquals("Answer", message.message.content)
        assertNull(message.message.chainOfThought)
        assertEquals(AgentMessageStatus.SUCCEEDED, message.message.status)
    }

    @Test
    fun `applied stream snapshot keeps activity scoped to its message`() {
        val existingActivity = InlineActivityState(
            completedSteps = listOf(ActivityStep.Thinking(id = "old-step", content = "Earlier work")),
        )
        val state = ConversationDetailState(
            inlineActivities = mapOf("m1" to existingActivity),
        )
        val activeActions = listOf(ActiveAction(id = 2, label = "Searching", serverName = "Web"))
        val completedSteps = listOf(ActivityStep.Action(id = "new-step", label = "Read file", serverName = "Drive"))

        val updated = state.withAppliedStreamSnapshot(
            messageId = "m2",
            snapshot = AgentMessageStream.Snapshot(
                messageId = "m2",
                activity = AgentMessageStream.Activity.GENERATING,
                activeActions = activeActions,
                completedSteps = completedSteps,
            ),
        )

        assertEquals(existingActivity, updated.inlineActivities.getValue("m1"))
        assertEquals(
            InlineActivityState(
                activity = AgentMessageStream.Activity.GENERATING,
                activeActions = activeActions,
                completedSteps = completedSteps,
            ),
            updated.inlineActivities.getValue("m2"),
        )
    }

    @Test
    fun `cleared live stream retains completed timeline state for its message`() {
        val completedSteps = listOf(ActivityStep.Thinking(id = "step-1", content = "Looked up context"))
        val state = ConversationDetailState(
            streamingMessageId = "m1",
            inlineActivities = mapOf(
                "m1" to InlineActivityState(
                    activity = AgentMessageStream.Activity.GENERATING,
                    activeActions = listOf(ActiveAction(id = 1, label = "Searching", serverName = "Web")),
                    completedSteps = completedSteps,
                ),
            ),
        )

        val cleared = state.withClearedLiveStream()
        val retainedActivity = cleared.inlineActivities.getValue("m1")

        assertNull(cleared.streamingMessageId)
        assertEquals(AgentMessageStream.Activity.GENERATING, retainedActivity.activity)
        assertTrue(retainedActivity.activeActions.isEmpty())
        assertEquals(completedSteps, retainedActivity.completedSteps)
    }

    @Test
    fun `agent done fallback status only handles errors`() {
        assertEquals(AgentMessageStatus.FAILED, fallbackAgentMessageDoneStatus("error"))
        assertNull(fallbackAgentMessageDoneStatus("succeeded"))
        assertNull(fallbackAgentMessageDoneStatus("cancelled"))
    }

    @Test
    fun `textWithAppendedTranscript preserves non-empty whitespace transcript`() {
        assertEquals("Existing   hello", textWithAppendedTranscript("Existing  ", "hello"))
        assertEquals("   hello", textWithAppendedTranscript("  ", "hello"))
        assertEquals(" ", textWithAppendedTranscript("", " "))
        assertEquals("Existing", textWithAppendedTranscript("Existing", ""))
    }

    @Test
    fun `reply content fragments include uploaded files only`() {
        val fragments = replyContentFragmentPayloads(
            uploadedAttachments = listOf(UploadedAttachment(fileName = "notes.txt", fileId = "file-1")),
            profilePictureUrl = "https://dust.tt/avatar.png",
        )

        assertEquals(
            listOf(
                ContentFragmentPayload.file(
                    title = "notes.txt",
                    fileId = "file-1",
                    context = ContentFragmentContext(profilePictureUrl = "https://dust.tt/avatar.png"),
                ),
            ),
            fragments,
        )
    }

    private fun agent(id: String, name: String): LightAgentConfiguration =
        LightAgentConfiguration(
            sId = id,
            name = name,
            description = "",
            scope = "global",
        )

    private fun knowledgeItem(id: String): KnowledgeItem =
        KnowledgeItem(
            title = "Handbook",
            internalId = id,
            dataSourceViewId = "dsv-1",
        )

    private fun agentMessage(
        id: String,
        status: AgentMessageStatus,
        content: String? = null,
        chainOfThought: String? = null,
    ): AgentMessage =
        AgentMessage(
            sId = id,
            type = MessageType.AGENT,
            created = 1.0,
            visibility = "visible",
            version = 0,
            rank = 1,
            status = status,
            content = content,
            chainOfThought = chainOfThought,
            configuration = AgentConfiguration(sId = "dust", name = "Dust"),
        )
}
