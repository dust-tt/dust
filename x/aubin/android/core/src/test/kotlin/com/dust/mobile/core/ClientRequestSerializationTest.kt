package com.dust.mobile.core

import com.dust.mobile.core.model.ContentFragmentContext
import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClientRequestSerializationTest {
    @Test
    fun `message request omits absent client request id`() {
        val request = PostMessageRequest(
            content = "Hello",
            mentions = listOf(MentionPayload("dust")),
            context = MessageContext(timezone = "Europe/Paris"),
        )

        assertFalse(DustJson.encodeToString(request).contains("clientRequestId"))
    }

    @Test
    fun `message and content fragment serialize client request ids`() {
        val requestId = "d2f3b6b7-95b0-4c9c-94a9-6100a7d20777"
        val request = PostMessageRequest(
            content = "Hello",
            mentions = listOf(MentionPayload("dust")),
            context = MessageContext(timezone = "Europe/Paris"),
            clientRequestId = requestId,
        )
        val fragment = ContentFragmentPayload.file(
            title = "brief.pdf",
            fileId = "fil_123",
            context = ContentFragmentContext(),
            clientRequestId = "$requestId:fragment:0",
        )

        assertTrue(DustJson.encodeToString(request).contains(requestId))
        assertTrue(DustJson.encodeToString(fragment).contains("$requestId:fragment:0"))
    }
}
