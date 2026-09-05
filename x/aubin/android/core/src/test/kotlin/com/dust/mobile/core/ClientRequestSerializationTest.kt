package com.dust.mobile.core

import com.dust.mobile.core.model.ContentFragmentPayload
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.model.PostMessageRequest
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertFalse
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
    fun `old persisted fragments decode without sending unsupported fields`() {
        val legacy = """{"title":"brief.pdf","fileId":"fil_123","context":{"profilePictureUrl":null},"clientRequestId":"legacy"}"""
        val fragment = DustJson.decodeFromString<ContentFragmentPayload>(legacy)
        assertFalse(DustJson.encodeToString(fragment).contains("clientRequestId"))
    }
}
