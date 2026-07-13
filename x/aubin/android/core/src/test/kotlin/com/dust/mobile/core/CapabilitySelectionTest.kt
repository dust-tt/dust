package com.dust.mobile.core

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.filterSelectableCapabilities
import org.junit.Assert.assertEquals
import org.junit.Test

class CapabilitySelectionTest {
    @Test
    fun `filterSelectableCapabilities hides selected capabilities`() {
        val research = skill(id = "sk_research", name = "Research")
        val browser = tool(id = "mcp_browser", name = "Browser", description = "Open web pages")

        val selectable = filterSelectableCapabilities(
            capabilities = listOf(research, browser),
            selected = listOf(research),
            query = "",
        )

        assertEquals(listOf(browser), selectable)
    }

    @Test
    fun `filterSelectableCapabilities searches names and descriptions`() {
        val research = skill(id = "sk_research", name = "Research", description = "Summarize documents")
        val browser = tool(id = "mcp_browser", name = "Browser", description = "Open web pages")
        val calendar = tool(id = "mcp_calendar", name = "Calendar", description = "Schedule meetings")

        val selectable = filterSelectableCapabilities(
            capabilities = listOf(research, browser, calendar),
            selected = emptyList(),
            query = "web",
        )

        assertEquals(listOf(browser), selectable)
    }

    @Test
    fun `filterSelectableCapabilities treats whitespace as real search text`() {
        val research = skill(id = "sk_research", name = "Research")
        val browser = tool(id = "mcp_browser", name = "Browser")

        val selectable = filterSelectableCapabilities(
            capabilities = listOf(research, browser),
            selected = emptyList(),
            query = " ",
        )

        assertEquals(emptyList<Capability>(), selectable)
    }

    @Test
    fun `filterSelectableCapabilities preserves source order before applying limit`() {
        val first = skill(id = "sk_first", name = "First")
        val second = skill(id = "sk_second", name = "Second")
        val third = skill(id = "sk_third", name = "Third")

        val selectable = filterSelectableCapabilities(
            capabilities = listOf(first, second, third),
            selected = emptyList(),
            query = "",
            limit = 2,
        )

        assertEquals(listOf(first, second), selectable)
    }

    private fun skill(id: String, name: String, description: String = ""): Capability =
        Capability.SkillCapability(Skill(sId = id, name = name, userFacingDescription = description))

    private fun tool(id: String, name: String, description: String = ""): Capability =
        Capability.Tool(
            MCPServerView(
                sId = id,
                name = name,
                description = description,
                spaceId = "space",
                server = MCPServer(sId = "server_$id", name = name, description = description),
            ),
        )
}
