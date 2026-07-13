package com.dust.mobile.core

import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.ActiveAction
import com.dust.mobile.core.model.BlockedState
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.CiteEntry
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.ActivityTimelineRowKind
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.MAX_THINKING_DISPLAY_LENGTH
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.ToolApprovalInfo
import com.dust.mobile.core.model.canRespondToBlockedAction
import com.dust.mobile.core.model.ToolInputValue
import com.dust.mobile.core.model.ToolStake
import com.dust.mobile.core.model.UserMessage
import com.dust.mobile.core.model.UserMessageContext
import com.dust.mobile.core.model.activeCitationEntries
import com.dust.mobile.core.model.activityTimelineDisplay
import com.dust.mobile.core.model.displayableGeneratedFiles
import com.dust.mobile.core.model.inlineBlockedStateForMessage
import com.dust.mobile.core.model.isCurrentUserMessage
import com.dust.mobile.core.model.shouldHideSteeredAgentHeader
import com.dust.mobile.core.model.steeredAgentHeaderMessageIds
import com.dust.mobile.core.model.toolApprovalDisplay
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MessageDisplayTest {
    @Test
    fun `blocked actions can only be answered by their triggering user`() {
        assertEquals(true, canRespondToBlockedAction(null, null))
        assertEquals(true, canRespondToBlockedAction(null, "user-1"))
        assertEquals(true, canRespondToBlockedAction("user-1", "user-1"))
        assertEquals(false, canRespondToBlockedAction("user-1", "user-2"))
        assertEquals(false, canRespondToBlockedAction("user-1", null))
    }

    @Test
    fun `hides agent header after interrupted message from same agent`() {
        val messages = listOf(
            agentMessage("a1", rank = 1, agentId = "dust", status = AgentMessageStatus.INTERRUPTED),
            userMessage("u1", rank = 2),
            agentMessage("a2", rank = 3, agentId = "dust", status = AgentMessageStatus.SUCCEEDED),
        )

        assertEquals(setOf("a2"), steeredAgentHeaderMessageIds(messages))
        assertTrue(shouldHideSteeredAgentHeader(messages, 2))
    }

    @Test
    fun `does not hide header when nearest prior agent is different`() {
        val messages = listOf(
            agentMessage("a1", rank = 1, agentId = "dust", status = AgentMessageStatus.GRACEFULLY_STOPPED),
            agentMessage("a2", rank = 2, agentId = "research", status = AgentMessageStatus.SUCCEEDED),
        )

        assertEquals(emptySet<String>(), steeredAgentHeaderMessageIds(messages))
        assertFalse(shouldHideSteeredAgentHeader(messages, 1))
    }

    @Test
    fun `nearest prior agent controls steering`() {
        val messages = listOf(
            agentMessage("a1", rank = 1, agentId = "dust", status = AgentMessageStatus.GRACEFULLY_STOPPED),
            agentMessage("a2", rank = 2, agentId = "research", status = AgentMessageStatus.SUCCEEDED),
            agentMessage("a3", rank = 3, agentId = "dust", status = AgentMessageStatus.SUCCEEDED),
        )

        assertEquals(emptySet<String>(), steeredAgentHeaderMessageIds(messages))
        assertFalse(shouldHideSteeredAgentHeader(messages, 2))
    }

    @Test
    fun `non-agent messages never hide agent headers`() {
        val messages = listOf(userMessage("u1", rank = 1))

        assertFalse(shouldHideSteeredAgentHeader(messages, 0))
    }

    @Test
    fun `identifies current user messages from context email`() {
        val message = userMessage("u1", rank = 1, email = "Ada@Dust.tt").message

        assertTrue(isCurrentUserMessage(message, "ada@dust.tt"))
        assertFalse(isCurrentUserMessage(message, "grace@dust.tt"))
    }

    @Test
    fun `activeCitationEntries preserves mapping order and skips missing refs`() {
        val first = citation(title = "First")
        val second = citation(title = "Second")

        val entries = activeCitationEntries(
            citeMapping = listOf(
                CiteEntry(ref = "b", number = 2),
                CiteEntry(ref = "missing", number = 3),
                CiteEntry(ref = "a", number = 1),
            ),
            citations = mapOf("a" to first, "b" to second),
        )

        assertEquals(listOf("b", "a"), entries.map { it.ref })
        assertEquals(listOf(2, 1), entries.map { it.number })
        assertEquals(listOf(second, first), entries.map { it.citation })
    }

    @Test
    fun `activeCitationEntries returns empty list without citations`() {
        val entries = activeCitationEntries(
            citeMapping = listOf(CiteEntry(ref = "a", number = 1)),
            citations = null,
        )

        assertEquals(emptyList<Any>(), entries)
    }

    @Test
    fun `displayableGeneratedFiles hides generated files while streaming`() {
        val message = agentMessage(
            "a1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.CREATED,
            generatedFiles = listOf(generatedFile("visible")),
        ).message

        assertEquals(emptyList<GeneratedFile>(), displayableGeneratedFiles(message))
    }

    @Test
    fun `displayableGeneratedFiles shows only visible generated files after streaming`() {
        val visible = generatedFile("visible")
        val hidden = generatedFile("hidden", hidden = true)
        val message = agentMessage(
            "a1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.SUCCEEDED,
            generatedFiles = listOf(hidden, visible),
        ).message

        assertEquals(listOf(visible), displayableGeneratedFiles(message))
    }

    @Test
    fun `inlineBlockedStateForMessage returns matching blocker for active streaming agent message`() {
        val message = agentMessage(
            "m1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.CREATED,
        )
        val blockedState = BlockedState.Approval(approvalInfo(messageId = "m1"))

        assertEquals(
            blockedState,
            inlineBlockedStateForMessage(
                message = message,
                streamingMessageId = "m1",
                blockedState = blockedState,
            ),
        )
    }

    @Test
    fun `inlineBlockedStateForMessage ignores blockers for non-streaming messages`() {
        val message = agentMessage(
            "m1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.SUCCEEDED,
        )
        val blockedState = BlockedState.Approval(approvalInfo(messageId = "m1"))

        assertEquals(null, inlineBlockedStateForMessage(message, "m1", blockedState))
    }

    @Test
    fun `inlineBlockedStateForMessage ignores blockers for a different streaming message`() {
        val message = agentMessage(
            "m1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.CREATED,
        )
        val blockedState = BlockedState.Approval(approvalInfo(messageId = "other"))

        assertEquals(null, inlineBlockedStateForMessage(message, "m1", blockedState))
    }

    @Test
    fun `inlineBlockedStateForMessage hosts auth blockers on the active streaming message`() {
        val message = agentMessage(
            "m1",
            rank = 1,
            agentId = "dust",
            status = AgentMessageStatus.CREATED,
        )
        val blockedState = BlockedState.PersonalAuth(provider = "Notion", toolName = "search")

        assertEquals(blockedState, inlineBlockedStateForMessage(message, "m1", blockedState))
    }

    @Test
    fun `activityTimelineDisplay keeps every completed step and appends done when finished`() {
        val display = activityTimelineDisplay(
            isStreaming = false,
            isGenerating = false,
            chainOfThought = null,
            completedSteps = listOf(
                ActivityStep.Thinking(id = "t1", content = "Inspecting"),
                ActivityStep.Action(id = "a1", label = "Searched", serverName = "search"),
                ActivityStep.Action(id = "a2", label = "Read file", serverName = "drive"),
                ActivityStep.Action(id = "a3", label = "Summarized", serverName = null),
                ActivityStep.Action(id = "a4", label = "Finished", serverName = null),
            ),
            activeActions = emptyList(),
        )

        assertEquals("Done", display.headerLabel)
        assertEquals(listOf("t1", "a1", "a2", "a3", "a4", "done"), display.rows.map { it.id })
        assertEquals(ActivityTimelineRowKind.DONE, display.rows.last().kind)
    }

    @Test
    fun `activityTimelineDisplay shows an idle writing row before stream content arrives`() {
        val display = activityTimelineDisplay(
            isStreaming = true,
            isGenerating = true,
            chainOfThought = null,
            completedSteps = emptyList(),
            activeActions = emptyList(),
        )

        assertEquals(null, display.headerLabel)
        assertEquals(listOf(ActivityTimelineRowKind.IDLE), display.rows.map { it.kind })
        assertEquals("Writing...", display.rows.single().label)
    }

    @Test
    fun `activityTimelineDisplay suppresses idle row while stream is blocked`() {
        val display = activityTimelineDisplay(
            isStreaming = true,
            isGenerating = false,
            isBlocking = true,
            chainOfThought = null,
            completedSteps = emptyList(),
            activeActions = emptyList(),
        )

        assertEquals(null, display.headerLabel)
        assertEquals(emptyList<ActivityTimelineRowKind>(), display.rows.map { it.kind })
    }

    @Test
    fun `activityTimelineDisplay includes active thinking and active actions while streaming`() {
        val display = activityTimelineDisplay(
            isStreaming = true,
            isGenerating = false,
            chainOfThought = "Looking at the evidence",
            completedSteps = listOf(ActivityStep.Action(id = "a1", label = "Opened file", serverName = "drive")),
            activeActions = listOf(ActiveAction(id = 7, label = "Searching", serverName = "search")),
        )

        assertEquals("Thinking...", display.headerLabel)
        assertEquals(
            listOf(
                ActivityTimelineRowKind.ACTION,
                ActivityTimelineRowKind.ACTIVE_THINKING,
                ActivityTimelineRowKind.ACTIVE_ACTION,
            ),
            display.rows.map { it.kind },
        )
    }

    @Test
    fun `activityTimelineDisplay truncates long finished thinking until expanded`() {
        val content = "x".repeat(MAX_THINKING_DISPLAY_LENGTH + 10)

        val collapsed = activityTimelineDisplay(
            isStreaming = false,
            isGenerating = false,
            chainOfThought = null,
            completedSteps = listOf(ActivityStep.Thinking(id = "t1", content = content)),
            activeActions = emptyList(),
        )
        val expanded = activityTimelineDisplay(
            isStreaming = false,
            isGenerating = false,
            chainOfThought = null,
            completedSteps = listOf(ActivityStep.Thinking(id = "t1", content = content)),
            activeActions = emptyList(),
            expandedThinkingIds = setOf("t1"),
        )

        assertEquals(true, collapsed.rows.first().isTruncated)
        assertEquals(true, collapsed.rows.first().isExpandable)
        assertEquals("x".repeat(MAX_THINKING_DISPLAY_LENGTH) + "...", collapsed.rows.first().label)
        assertEquals(false, expanded.rows.first().isTruncated)
        assertEquals(true, expanded.rows.first().isExpandable)
        assertEquals(content, expanded.rows.first().label)
    }

    @Test
    fun `toolApprovalDisplay builds title and allow-once label for always-allow actions`() {
        val display = toolApprovalDisplay(
            approvalInfo(
                toolName = "search",
                serverName = "Notion",
                stake = ToolStake.LOW,
                inputs = mapOf("query" to ToolInputValue.StringValue("roadmap")),
            ),
        )

        assertEquals("Allow Notion to search?", display.title)
        assertEquals("Allow once", display.approveLabel)
        assertEquals(true, display.canAlwaysAllow)
        assertEquals(listOf("Query" to "roadmap"), display.inputs)
    }

    @Test
    fun `toolApprovalDisplay preserves whitespace-only string input values`() {
        val display = toolApprovalDisplay(
            approvalInfo(
                inputs = mapOf(
                    "empty" to ToolInputValue.StringValue(""),
                    "spaced" to ToolInputValue.StringValue("   "),
                ),
            ),
        )

        assertEquals(listOf("Spaced" to "   "), display.inputs)
    }

    @Test
    fun `toolApprovalDisplay humanizes uppercase input keys like Swift`() {
        val display = toolApprovalDisplay(
            approvalInfo(
                inputs = mapOf(
                    "apiURL" to ToolInputValue.StringValue("https://dust.tt"),
                    "search_query" to ToolInputValue.StringValue("roadmap"),
                ),
            ),
        )

        assertEquals(
            listOf(
                "Api U R L" to "https://dust.tt",
                "Search Query" to "roadmap",
            ),
            display.inputs,
        )
    }

    @Test
    fun `toolApprovalDisplay truncates long input values with ellipsis`() {
        val display = toolApprovalDisplay(
            approvalInfo(
                inputs = mapOf("query" to ToolInputValue.StringValue("x".repeat(301))),
            ),
        )

        assertEquals(listOf("Query" to "x".repeat(300) + "\u2026"), display.inputs)
    }

    @Test
    fun `toolApprovalDisplay falls back to generic approval title`() {
        val display = toolApprovalDisplay(
            approvalInfo(toolName = null, serverName = null, stake = ToolStake.HIGH),
        )

        assertEquals("Tool requires approval", display.title)
        assertEquals("Allow", display.approveLabel)
        assertEquals(false, display.canAlwaysAllow)
        assertEquals(emptyList<Pair<String, String>>(), display.inputs)
    }

    private fun userMessage(sId: String, rank: Int, email: String? = null): ConversationMessage.User =
        ConversationMessage.User(
            UserMessage(
                id = rank,
                sId = sId,
                type = MessageType.USER,
                created = rank.toDouble(),
                visibility = "visible",
                version = 0,
                rank = rank,
                content = "hello",
                context = email?.let { UserMessageContext(email = it) },
            ),
        )

    private fun agentMessage(
        sId: String,
        rank: Int,
        agentId: String,
        status: AgentMessageStatus,
        generatedFiles: List<GeneratedFile>? = null,
    ): ConversationMessage.Agent =
        ConversationMessage.Agent(
            AgentMessage(
                sId = sId,
                type = MessageType.AGENT,
                created = rank.toDouble(),
                visibility = "visible",
                version = 0,
                rank = rank,
                status = status,
                configuration = AgentConfiguration(sId = agentId, name = agentId),
                generatedFiles = generatedFiles,
            ),
        )

    private fun generatedFile(fileId: String, hidden: Boolean? = null): GeneratedFile =
        GeneratedFile(
            fileId = fileId,
            title = "$fileId.txt",
            contentType = "text/plain",
            hidden = hidden,
        )

    private fun citation(title: String): CitationReference =
        CitationReference(
            title = title,
            provider = "notion",
            contentType = "text/plain",
            href = "https://dust.tt/$title",
        )

    private fun approvalInfo(
        toolName: String? = "search",
        serverName: String? = "Notion",
        stake: ToolStake? = ToolStake.LOW,
        inputs: Map<String, ToolInputValue>? = null,
        messageId: String = "m1",
    ): ToolApprovalInfo =
        ToolApprovalInfo(
            actionId = "a1",
            messageId = messageId,
            conversationId = "c1",
            triggeringUserId = null,
            toolName = toolName,
            mcpServerName = serverName,
            agentName = "Dust",
            stake = stake,
            inputs = inputs,
            argumentsRequiringApproval = null,
        )
}
