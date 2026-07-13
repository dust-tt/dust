package com.dust.mobile.core

import com.dust.mobile.core.model.ConversationMessagesResponse
import com.dust.mobile.core.model.ConversationsResponse
import com.dust.mobile.core.model.ConversationMessage
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.network.DustJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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
    fun `conversation preview supports versioned content arrays`() {
        val json = """
            {
              "conversations": [{
                "sId": "c1",
                "created": 1700000000000,
                "updated": 1700000100000,
                "title": "Planning",
                "unread": true,
                "actionRequired": false,
                "content": [[
                  {
                    "type": "user_message",
                    "visibility": "hidden",
                    "content": "hidden",
                    "user": {"fullName": "Hidden"}
                  },
                  {
                    "type": "user_message",
                    "visibility": "visible",
                    "content": "  # Hello   Dust ",
                    "user": {"fullName": "Ada", "image": "avatar.png"}
                  }
                ]]
              }],
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        val response = DustJson.decodeFromString<ConversationsResponse>(json)

        val preview = response.conversations.single().preview
        assertEquals("Ada", preview?.authorName)
        assertEquals("avatar.png", preview?.authorAvatarUrl)
        assertEquals("Hello Dust", preview?.snippet)
        assertEquals(0, preview?.replyCount)
    }

    @Test
    fun `conversation preview ignores malformed preview content without failing response`() {
        val json = """
            {
              "conversations": [{
                "sId": "c1",
                "created": 1700000000000,
                "updated": 1700000100000,
                "title": "Planning",
                "unread": false,
                "actionRequired": false,
                "content": [{
                  "visibility": "visible",
                  "content": "Missing type should not fail the conversation list"
                }]
              }],
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        val response = DustJson.decodeFromString<ConversationsResponse>(json)

        assertEquals("c1", response.conversations.single().sId)
        assertNull(response.conversations.single().preview)
    }

    @Test
    fun `conversation preview preserves agent avatar identity`() {
        val json = """
            {
              "conversations": [{
                "sId": "c1",
                "created": 1700000000000,
                "updated": 1700000100000,
                "title": "Planning",
                "unread": true,
                "actionRequired": false,
                "content": [{
                  "type": "agent_message",
                  "status": "succeeded",
                  "content": "Ready for review",
                  "configuration": {
                    "name": "Dust",
                    "pictureUrl": "https://dust.tt/static/systemavatar/dust_avatar_full.png"
                  }
                }]
              }],
              "hasMore": false,
              "lastValue": null
            }
        """.trimIndent()

        val preview = DustJson.decodeFromString<ConversationsResponse>(json)
            .conversations.single().preview

        assertEquals("Dust", preview?.authorName)
        assertEquals(
            "https://dust.tt/static/systemavatar/dust_avatar_full.png",
            preview?.authorAvatarUrl,
        )
        assertTrue(preview?.isAgent == true)
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
