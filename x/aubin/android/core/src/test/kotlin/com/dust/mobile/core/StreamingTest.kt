package com.dust.mobile.core

import com.dust.mobile.core.model.ActionDisplayLabels
import com.dust.mobile.core.model.ActionSummary
import com.dust.mobile.core.model.ActivityStep
import com.dust.mobile.core.model.AgentActionSuccessEvent
import com.dust.mobile.core.model.AgentConfiguration
import com.dust.mobile.core.model.AgentMessage
import com.dust.mobile.core.model.AgentMessageStatus
import com.dust.mobile.core.model.AgentMessageSuccessEvent
import com.dust.mobile.core.model.ConversationEventData
import com.dust.mobile.core.model.GenerationTokensEvent
import com.dust.mobile.core.model.MessageType
import com.dust.mobile.core.model.StreamingEventData
import com.dust.mobile.core.model.TokenClassification
import com.dust.mobile.core.model.ToolParamsEvent
import com.dust.mobile.core.stream.AgentMessageStream
import com.dust.mobile.core.stream.StreamEventCursor
import com.dust.mobile.core.stream.StreamingReconnect
import com.dust.mobile.core.stream.StreamingEventParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StreamingTest {
    @Test
    fun `parses SSE data lines and ignores done`() {
        val payloads = StreamingEventParser.parseSseDataLines(
            """
                event: message
                data: {"eventId":"1"}

                data: done${" "}
            """.trimIndent(),
        )

        assertEquals(listOf("""{"eventId":"1"}"""), payloads)
    }

    @Test
    fun `parses SSE data lines preserving non-space whitespace payloads`() {
        val payloads = StreamingEventParser.parseSseDataLines("data: \t")

        assertEquals(listOf("\t"), payloads)
    }

    @Test
    fun `parses conversation title event`() {
        val envelope = StreamingEventParser.parseConversationEvent(
            """
            {
              "eventId": "evt_1",
              "data": {
                "type": "conversation_title",
                "created": 1700000000000,
                "title": "Quarterly planning"
              }
            }
            """.trimIndent(),
        )

        val title = (envelope.data as ConversationEventData.ConversationTitle).event.title
        assertEquals("evt_1", envelope.eventId)
        assertEquals("Quarterly planning", title)
    }

    @Test
    fun `stream cursor deduplicates event ids and tracks last event`() {
        val cursor = StreamEventCursor()

        assertEquals(true, cursor.shouldProcess("evt_1"))
        assertEquals("evt_1", cursor.lastEventId)
        assertEquals(false, cursor.shouldProcess("evt_1"))
        assertEquals(true, cursor.shouldProcess(""))
        assertEquals("evt_1", cursor.lastEventId)
    }

    @Test
    fun `reconnect delay backs off errors and resets after clean reconnect`() {
        val first = StreamingReconnect.nextDelay(
            shouldBackOff = true,
            retryDelayMs = StreamingReconnect.INITIAL_RETRY_DELAY_MS,
        )
        val capped = StreamingReconnect.nextDelay(
            shouldBackOff = true,
            retryDelayMs = StreamingReconnect.MAX_RETRY_DELAY_MS,
        )
        val clean = StreamingReconnect.nextDelay(
            shouldBackOff = false,
            retryDelayMs = first.nextRetryDelayMs,
        )

        assertEquals(StreamingReconnect.INITIAL_RETRY_DELAY_MS, first.delayMs)
        assertEquals(2_000L, first.nextRetryDelayMs)
        assertEquals(StreamingReconnect.MAX_RETRY_DELAY_MS, capped.nextRetryDelayMs)
        assertEquals(StreamingReconnect.CLEAN_RECONNECT_DELAY_MS, clean.delayMs)
        assertEquals(StreamingReconnect.INITIAL_RETRY_DELAY_MS, clean.nextRetryDelayMs)
    }

    @Test
    fun `agent stream flushes thinking before completed action`() {
        val stream = AgentMessageStream("m1")

        stream.apply(
            StreamingEventData.GenerationTokens(
                GenerationTokensEvent(
                    created = 1.0,
                    configurationId = "dust",
                    messageId = "m1",
                    text = "Thinking",
                    classification = TokenClassification.CHAIN_OF_THOUGHT,
                ),
            ),
        )
        stream.apply(
            StreamingEventData.ToolParams(
                ToolParamsEvent(
                    created = 2.0,
                    configurationId = "dust",
                    messageId = "m1",
                    action = ActionSummary(
                        id = 7,
                        toolName = "search",
                        displayLabels = ActionDisplayLabels(running = "Searching", done = "Searched"),
                    ),
                ),
            ),
        )
        stream.apply(
            StreamingEventData.AgentActionSuccess(
                AgentActionSuccessEvent(
                    created = 3.0,
                    configurationId = "dust",
                    messageId = "m1",
                    action = ActionSummary(
                        id = 7,
                        toolName = "search",
                        displayLabels = ActionDisplayLabels(running = "Searching", done = "Searched"),
                    ),
                ),
            ),
        )

        assertEquals(
            ActivityStep.Thinking(id = "thinking-1", content = "Thinking"),
            stream.snapshot.completedSteps[0],
        )
        assertEquals(
            ActivityStep.Action(id = "action-2", label = "Searched", serverName = null),
            stream.snapshot.completedSteps[1],
        )
    }

    @Test
    fun `terminal agent message clears streamed chain of thought when final message has none`() {
        val stream = AgentMessageStream("m1")

        stream.apply(
            StreamingEventData.GenerationTokens(
                GenerationTokensEvent(
                    created = 1.0,
                    configurationId = "dust",
                    messageId = "m1",
                    text = "Thinking",
                    classification = TokenClassification.CHAIN_OF_THOUGHT,
                ),
            ),
        )
        stream.apply(
            StreamingEventData.AgentMessageSuccess(
                AgentMessageSuccessEvent(
                    created = 2.0,
                    configurationId = "dust",
                    messageId = "m1",
                    message = finalAgentMessage(content = "Answer", chainOfThought = null),
                ),
            ),
        )

        assertEquals("Answer", stream.snapshot.content)
        assertNull(stream.snapshot.chainOfThought)
        assertEquals(AgentMessageStatus.SUCCEEDED, stream.snapshot.status)
        assertEquals(
            listOf(ActivityStep.Thinking(id = "thinking-1", content = "Thinking")),
            stream.snapshot.completedSteps,
        )
    }

    private fun finalAgentMessage(content: String, chainOfThought: String?): AgentMessage =
        AgentMessage(
            sId = "m1",
            type = MessageType.AGENT,
            created = 2.0,
            visibility = "visible",
            version = 0,
            rank = 1,
            status = AgentMessageStatus.SUCCEEDED,
            content = content,
            chainOfThought = chainOfThought,
            configuration = AgentConfiguration(sId = "dust", name = "Dust"),
        )
}
