package com.dust.mobile.core

import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.selectableKnowledgeItems
import org.junit.Assert.assertEquals
import org.junit.Test

class KnowledgeSelectionTest {
    @Test
    fun `filters selected knowledge items from search results`() {
        val selected = knowledgeItem("datasource-a", "node-1", "Selected")
        val other = knowledgeItem("datasource-a", "node-2", "Other")

        assertEquals(listOf(other), selectableKnowledgeItems(listOf(selected, other), listOf(selected)))
    }

    private fun knowledgeItem(dataSourceViewId: String, internalId: String, title: String): KnowledgeItem =
        KnowledgeItem(
            title = title,
            internalId = internalId,
            dataSourceViewId = dataSourceViewId,
        )
}
