package com.dust.mobile.android.ui.composer

import com.dust.mobile.android.data.persistence.PersistedDraft
import com.dust.mobile.android.data.persistence.PersistedOutboxItem
import com.dust.mobile.android.data.persistence.PersistedOutboxKind
import com.dust.mobile.android.data.persistence.PersistedOutboxStatus
import com.dust.mobile.android.ui.conversation.detail.ConversationDetailState
import com.dust.mobile.android.ui.conversation.detail.restoreReplyDraftContent
import com.dust.mobile.android.ui.conversation.detail.toPersistedReplyDraft
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.network.DustJson
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftPersistenceTest {
    private val knowledge = listOf(KnowledgeItem("Handbook", "node-1", "view-1"))

    @Test
    fun `new conversation and reply restore their knowledge context after serialization`() {
        val compose = ComposeState(text = "Summarize this", selectedKnowledgeItems = knowledge)
        val reply = ConversationDetailState(replyText = "Find the policy", selectedKnowledgeItems = knowledge)
        val storedCompose = roundTrip(compose.toPersistedDraft())
        val storedReply = roundTrip(reply.toPersistedReplyDraft())

        assertEquals(knowledge, ComposeState().restoreDraftContent(storedCompose).selectedKnowledgeItems)
        assertEquals(
            knowledge,
            ConversationDetailState().restoreReplyDraftContent(storedReply).selectedKnowledgeItems,
        )
        assertEquals("Find the policy", storedReply.text)
    }

    @Test
    fun `drafts saved by older versions still restore`() {
        val draft = DustJson.decodeFromString<PersistedDraft>("""{"text":"Unfinished message"}""")
        assertEquals("Unfinished message", draft.text)
        assertTrue(draft.selectedKnowledgeItems.isEmpty())
    }

    @Test
    fun `only an accepted send can provide a conversation destination when offline`() {
        val pending = PersistedOutboxItem(
            id = "request",
            kind = PersistedOutboxKind.CREATE_CONVERSATION,
            workspaceId = "workspace",
            createdAtEpochMillis = 123L,
        )
        assertNull(pending.sentConversationDestination())
        assertNull(pending.copy(resultConversationId = "conversation").sentConversationDestination())
        val accepted = pending.copy(
            status = PersistedOutboxStatus.SENT,
            resultConversationId = "conversation",
        ).sentConversationDestination()
        assertEquals("conversation", accepted?.sId)
        assertEquals(123.0, accepted?.created)
    }

    private fun roundTrip(draft: PersistedDraft): PersistedDraft =
        DustJson.decodeFromString(DustJson.encodeToString(draft))
}
