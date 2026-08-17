package com.dust.mobile.core

import com.dust.mobile.core.model.ConversationMessagesResponse
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.ToolInputValue
import com.dust.mobile.core.network.DustJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ParsingTest {
    @Test
    fun `generated files support path-only tool output`() {
        val file = DustJson.decodeFromString<GeneratedFile>(
            """{"fileId":null,"filePath":"/tmp/report.csv","title":"report.csv","contentType":"text/csv"}""",
        )

        assertNull(file.fileId)
        assertEquals("/tmp/report.csv", file.filePath)
        assertEquals("report.csv", file.title)
    }

    @Test
    fun `tool inputs preserve nested JSON values`() {
        val input = DustJson.decodeFromString<ToolInputValue>(
            """{"filters":{"owners":["me","team"],"active":true}}""",
        )

        assertEquals(
            """{"filters":{"owners":["me","team"],"active":true}}""",
            input.displayValue,
        )
    }

    @Test
    fun `content fragments reject ambiguous wire payloads`() {
        val json = """
            {
              "title": "Invalid",
              "fileId": "f1",
              "nodeId": "n1",
              "nodeDataSourceViewId": "dsv1",
              "context": {"profilePictureUrl": null}
            }
        """.trimIndent()

        assertThrows(Exception::class.java) {
            DustJson.decodeFromString<ContentFragmentPayload>(json)
        }
    }

    @Test
    fun `conversation list item decodes without message content`() {
        val json = """
            {
              "conversations": [{
                "sId": "c1",
                "created": 1700000000000,
                "updated": 1700000100000,
                "title": "Planning",
                "unread": true,
                "actionRequired": false,
                "hasError": true,
                "lastReadMs": 1700000050000,
                "metadata": {},
                "nextWakeupAt": 1700000200000,
                "requestedSpaceIds": ["space-1"],
                "spaceId": "space-1",
                "triggerId": "trigger-1",
                "isRunningAgentLoop": true
              }],
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        val response = DustJson.decodeFromString<ConversationsResponse>(json)
        val conversation = response.conversations.single()

        assertEquals("c1", conversation.sId)
        assertEquals("Planning", conversation.title)
        assertEquals(true, conversation.unread)
        assertEquals(false, conversation.actionRequired)
        assertEquals(true, conversation.hasError)
        assertEquals(1700000050000.0, conversation.lastReadMs)
        assertEquals(1700000200000.0, conversation.nextWakeupAt)
        assertEquals(listOf("space-1"), conversation.requestedSpaceIds)
        assertEquals("space-1", conversation.spaceId)
        assertEquals("trigger-1", conversation.triggerId)
        assertEquals(true, conversation.isRunningAgentLoop)
    }

    @Test
    fun `conversation messages skip unrenderable message types`() {
        val json = """
            {
              "messages": [
                {"type": "compaction_message", "rank": 1},
                {
                  "id": 10,
                  "sId": "m1",
                  "type": "user_message",
                  "created": 1700000000000,
                  "visibility": "visible",
                  "version": 0,
                  "rank": 2,
                  "content": "hello"
                }
              ],
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        val response = DustJson.decodeFromString<ConversationMessagesResponse>(json)

        assertEquals(1, response.messages.size)
        assertEquals("m1", (response.messages.single() as ConversationMessage.User).message.sId)
        assertNull(response.lastValue)
    }

    @Test
    fun `conversation messages require messages array`() {
        val json = """
            {
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        assertThrows(Exception::class.java) {
            DustJson.decodeFromString<ConversationMessagesResponse>(json)
        }
    }

    @Test
    fun `conversation messages require numeric last value`() {
        val json = """
            {
              "messages": [],
              "hasMore": true,
              "lastValue": "12"
            }
        """.trimIndent()

        assertThrows(Exception::class.java) {
            DustJson.decodeFromString<ConversationMessagesResponse>(json)
        }
    }
}
