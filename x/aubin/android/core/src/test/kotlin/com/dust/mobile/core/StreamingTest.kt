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
import org.junit.Assert.assertTrue
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
    fun `parses agent loop step on generation tokens`() {
        val envelope = StreamingEventParser.parseMessageEvent(
            """
            {
              "eventId": "evt_1",
              "data": {
                "type": "generation_tokens",
                "created": 1700000000000,
                "configurationId": "dust",
                "messageId": "m1",
                "text": "Hello",
                "classification": "tokens",
                "traceId": "trace-1",
                "step": 3
              }
            }
            """.trimIndent(),
        )

        val tokens = (envelope.data as StreamingEventData.GenerationTokens).event
        assertEquals("trace-1", tokens.traceId)
        assertEquals(3, tokens.step)
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
    fun `agent stream appends content across agent loop steps`() {
        val stream = AgentMessageStream("m1")

        stream.apply(generationTokens(text = "First result. ", traceId = "trace-0", step = 0))
        stream.apply(generationTokens(text = "Final answer.", traceId = "trace-1", step = 1))

        assertEquals("First result. Final answer.", stream.snapshot.content)
    }

    @Test
    fun `agent stream shadow replays a same step retry without clearing content`() {
        val stream = AgentMessageStream("m1")
        val visibleSnapshots = mutableListOf<String>()

        stream.apply(generationTokens(text = "Hello ", traceId = "attempt-1", step = 0))
        visibleSnapshots += stream.snapshot.content
        stream.apply(generationTokens(text = "world", traceId = "attempt-1", step = 0))
        visibleSnapshots += stream.snapshot.content
        stream.apply(
            generationTokens(
                text = "Trying again",
                classification = TokenClassification.CHAIN_OF_THOUGHT,
                traceId = "attempt-2",
                step = 0,
            ),
        )
        visibleSnapshots += stream.snapshot.content
        stream.apply(generationTokens(text = "Hello ", step = 0))
        visibleSnapshots += stream.snapshot.content
        stream.apply(generationTokens(text = "world!", step = 0))
        visibleSnapshots += stream.snapshot.content

        assertEquals("Hello world!", stream.snapshot.content)
        assertTrue(visibleSnapshots.zipWithNext().all { (before, after) -> after.startsWith(before) })
    }

    @Test
    fun `agent stream keeps visible content during a divergent same step retry`() {
        val stream = AgentMessageStream("m1")

        stream.apply(generationTokens(text = "Draft answer", traceId = "attempt-1", step = 0))
        stream.apply(
            generationTokens(
                text = "Retrying",
                classification = TokenClassification.CHAIN_OF_THOUGHT,
                traceId = "attempt-2",
                step = 0,
            ),
        )
        stream.apply(generationTokens(text = "Different answer", step = 0))

        assertEquals("Draft answer", stream.snapshot.content)

        stream.apply(
            StreamingEventData.AgentMessageSuccess(
                AgentMessageSuccessEvent(
                    created = 2.0,
                    configurationId = "dust",
                    messageId = "m1",
                    message = finalAgentMessage(content = "Different answer", chainOfThought = null),
                ),
            ),
        )

        assertEquals("Different answer", stream.snapshot.content)
        assertEquals(AgentMessageStatus.SUCCEEDED, stream.snapshot.status)
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

    private fun generationTokens(
        text: String,
        classification: TokenClassification = TokenClassification.TOKENS,
        traceId: String? = null,
        step: Int? = null,
    ): StreamingEventData.GenerationTokens = StreamingEventData.GenerationTokens(
        GenerationTokensEvent(
            created = 1.0,
            configurationId = "dust",
            messageId = "m1",
            text = text,
            classification = classification,
            traceId = traceId,
            step = step,
        ),
    )

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
