package com.dust.mobile.android.ui.composer

import com.dust.mobile.core.model.KnowledgeItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class KnowledgeItemMetadataTest {
    @Test
    fun `formats backend metadata as user-facing labels`() {
        assertEquals(
            "Google Drive · Document",
            knowledgeItemMetadataLabel(item(connectorProvider = "google_drive", nodeType = "document")),
        )
        assertEquals(
            "Microsoft SharePoint · URL",
            knowledgeItemMetadataLabel(item(connectorProvider = "microsoft_sharepoint", nodeType = "url")),
        )
        assertEquals(
            "Custom Source · Folder",
            knowledgeItemMetadataLabel(item(connectorProvider = "custom_source", nodeType = "folder")),
        )
    }

    @Test
    fun `omits metadata when the backend provides none`() {
        assertNull(knowledgeItemMetadataLabel(item()))
    }

    private fun item(
        connectorProvider: String? = null,
        nodeType: String? = null,
    ) = KnowledgeItem(
        title = "Account plan",
        internalId = "node-1",
        dataSourceViewId = "view-1",
        connectorProvider = connectorProvider,
        nodeType = nodeType,
    )
}
