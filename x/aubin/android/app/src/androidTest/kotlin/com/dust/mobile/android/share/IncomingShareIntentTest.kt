package com.dust.mobile.android.share

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IncomingShareIntentTest {
    @Test
    fun parsesTextAndDeduplicatesSharedUris() {
        val uri = Uri.parse("content://com.example.documents/document/briefing")
        val intent = Intent(Intent.ACTION_SEND).apply {
            putExtra(Intent.EXTRA_TEXT, "Review this briefing")
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri("briefing", uri)
        }

        assertEquals(
            IncomingShare(
                id = 42L,
                text = "Review this briefing",
                uris = listOf(uri),
            ),
            intent.toIncomingShare(id = 42L),
        )
    }

    @Test
    fun ignoresIntentsWithoutShareContent() {
        assertNull(Intent(Intent.ACTION_VIEW).toIncomingShare(id = 42L))
        assertNull(Intent(Intent.ACTION_SEND).toIncomingShare(id = 42L))
    }

    @Test
    fun parsesDirectShareTarget() {
        val intent = Intent(Intent.ACTION_SEND).apply {
            putExtra(Intent.EXTRA_TEXT, "Summarize this")
            putExtra(EXTRA_TARGET_WORKSPACE_ID, "workspace-1")
            putExtra(EXTRA_TARGET_AGENT_ID, "agent-1")
            putExtra(EXTRA_TARGET_SHORTCUT_ID, "agent:workspace-1:agent-1")
        }

        assertEquals(
            IncomingShare(
                id = 42L,
                text = "Summarize this",
                uris = emptyList(),
                targetWorkspaceId = "workspace-1",
                targetAgentId = "agent-1",
                shortcutId = "agent:workspace-1:agent-1",
            ),
            intent.toIncomingShare(id = 42L),
        )
    }
}
