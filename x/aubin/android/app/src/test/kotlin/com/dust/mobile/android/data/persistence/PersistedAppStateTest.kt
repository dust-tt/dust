package com.dust.mobile.android.data.persistence

import com.dust.mobile.core.model.CreateConversationRequest
import com.dust.mobile.core.model.CreateMessagePayload
import com.dust.mobile.core.model.MentionPayload
import com.dust.mobile.core.model.MessageContext
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Test

class PersistedAppStateTest {
    @Test
    fun `round trips nested destination draft and outbox`() {
        val requestId = "49b69cc7-a2c1-47a3-9361-f13341f6f027"
        val state = PersistedAppState(
            selectedWorkspaceId = "w_123",
            destination = PersistedDestination(
                kind = PersistedDestinationKind.ATTACHMENT,
                title = "Brief",
                contentType = "application/pdf",
                fileId = "fil_123",
                returnTo = PersistedDestination(
                    kind = PersistedDestinationKind.CONVERSATION,
                    conversationId = "conv_123",
                ),
            ),
            drafts = mapOf(
                "compose:w_123:" to PersistedDraft(
                    text = "Summarize this",
                    selectedAgentId = "dust",
                    pendingOutboxId = requestId,
                ),
            ),
            outbox = listOf(
                PersistedOutboxItem(
                    id = requestId,
                    kind = PersistedOutboxKind.CREATE_CONVERSATION,
                    workspaceId = "w_123",
                    createRequest = CreateConversationRequest(
                        message = CreateMessagePayload(
                            content = "Summarize this",
                            mentions = listOf(MentionPayload("dust")),
                            context = MessageContext(timezone = "Europe/Paris"),
                        ),
                    ),
                    createdAtEpochMillis = 123L,
                ),
            ),
        )

        val restored = DustJson.decodeFromString<PersistedAppState>(DustJson.encodeToString(state))

        assertEquals(state, restored)
    }
}
