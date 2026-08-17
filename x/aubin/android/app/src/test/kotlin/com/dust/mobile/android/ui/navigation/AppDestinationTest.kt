package com.dust.mobile.android.ui.navigation

import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.Space
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppDestinationTest {
    @Test
    fun `inbox return chain uses list detail layout`() {
        val detail = Destination.ConversationDetail(conversation)
        val files = Destination.ConversationFiles(conversation, detail)
        val attachment = Destination.AttachmentViewer(
            title = "Brief.pdf",
            contentType = "application/pdf",
            fileId = "file-1",
            sourceUrl = null,
            returnTo = files,
        )

        assertTrue(Destination.List.usesInboxListDetailLayout)
        assertTrue(detail.usesInboxListDetailLayout)
        assertTrue(files.usesInboxListDetailLayout)
        assertTrue(attachment.usesInboxListDetailLayout)
    }

    @Test
    fun `non inbox destinations keep single pane layout`() {
        val pod = Destination.Pod(space)

        assertFalse(Destination.Compose().usesInboxListDetailLayout)
        assertFalse(Destination.CatchUp(listOf(conversation)).usesInboxListDetailLayout)
        assertFalse(pod.usesInboxListDetailLayout)
        assertFalse(
            Destination.ConversationDetail(
                conversation = conversation,
                returnTo = pod,
            ).usesInboxListDetailLayout,
        )
    }

    @Test
    fun `file viewers do not consume back for a stale ime state`() {
        assertFalse(
            Destination.ConversationFiles(
                conversation = conversation,
                returnTo = Destination.List,
            ).dismissesImeBeforeBackNavigation,
        )
        assertFalse(
            Destination.AttachmentViewer(
                title = "Brief.pdf",
                contentType = "application/pdf",
                fileId = "file-1",
                sourceUrl = null,
                returnTo = Destination.List,
            ).dismissesImeBeforeBackNavigation,
        )
        assertTrue(Destination.List.dismissesImeBeforeBackNavigation)
        assertTrue(Destination.Compose().dismissesImeBeforeBackNavigation)
        assertTrue(Destination.ConversationDetail(conversation).dismissesImeBeforeBackNavigation)
    }

    @Test
    fun `composer opened from a conversation returns to that conversation`() {
        val detail = Destination.ConversationDetail(conversation)

        assertTrue(Destination.Compose(returnTo = detail).backDestinationOrNull() == detail)
    }

    private val conversation = Conversation(
        sId = "conversation-1",
        created = 1.0,
        updated = 2.0,
        title = "Quarterly briefing",
        unread = false,
        actionRequired = false,
    )

    private val space = Space(
        sId = "space-1",
        name = "Revenue",
        kind = "project",
    )
}
