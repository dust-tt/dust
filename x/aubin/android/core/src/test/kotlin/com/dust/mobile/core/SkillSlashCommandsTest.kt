package com.dust.mobile.core

import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.MCPServer
import com.dust.mobile.core.model.MCPServerView
import com.dust.mobile.core.model.Skill
import com.dust.mobile.core.model.SkillSlashQuery
import com.dust.mobile.core.model.activeSkillSlashQuery
import com.dust.mobile.core.model.filterSkillSlashSuggestions
import com.dust.mobile.core.model.removeActiveSkillSlashQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SkillSlashCommandsTest {
    @Test
    fun `finds slash queries at the start or after whitespace`() {
        assertEquals(SkillSlashQuery(0, ""), activeSkillSlashQuery("/"))
        assertEquals(SkillSlashQuery(4, "brief"), activeSkillSlashQuery("Ask /brief"))
        assertEquals(SkillSlashQuery(6, "meeting notes"), activeSkillSlashQuery("First\n/meeting notes"))
    }

    @Test
    fun `ignores slash queries outside the active text boundary`() {
        assertNull(activeSkillSlashQuery("https://dust.tt"))
        assertNull(activeSkillSlashQuery("Ask / brief"))
        assertNull(activeSkillSlashQuery("Ask /path/to/file"))
        assertNull(activeSkillSlashQuery("Ask /brief\nContinue"))
    }

    @Test
    fun `removes only the active slash query`() {
        assertEquals("", removeActiveSkillSlashQuery("/brief"))
        assertEquals("Ask ", removeActiveSkillSlashQuery("Ask /brief notes"))
        assertEquals("https://dust.tt", removeActiveSkillSlashQuery("https://dust.tt"))
    }

    @Test
    fun `filters skills by fuzzy name or description and excludes tools and selected skills`() {
        val briefing = skill("skill-brief", "Customer briefing", "Create account summaries")
        val meeting = skill("skill-meeting", "Meeting follow-up", "Capture decisions and owners")
        val selected = skill("skill-selected", "Selected skill", "Already attached")

        assertEquals(
            listOf(briefing),
            filterSkillSlashSuggestions(
                capabilities = listOf(tool(), meeting, selected, briefing),
                selected = listOf(selected),
                query = "cbrief",
            ),
        )
        assertEquals(
            listOf(meeting),
            filterSkillSlashSuggestions(
                capabilities = listOf(briefing, meeting),
                selected = emptyList(),
                query = "owners",
            ),
        )
    }

    @Test
    fun `ranks title matches above description matches and applies the limit`() {
        val titleMatch = skill("skill-title", "Research", "Find source material")
        val descriptionMatch = skill("skill-description", "Digest", "Research workspace updates")
        val otherTitleMatch = skill("skill-other", "Research brief", "Prepare a summary")

        assertEquals(
            listOf(titleMatch, otherTitleMatch),
            filterSkillSlashSuggestions(
                capabilities = listOf(descriptionMatch, otherTitleMatch, titleMatch),
                selected = emptyList(),
                query = "research",
                limit = 2,
            ),
        )
    }

    private fun skill(id: String, name: String, description: String): Capability.SkillCapability =
        Capability.SkillCapability(
            Skill(
                sId = id,
                name = name,
                userFacingDescription = description,
            ),
        )

    private fun tool(): Capability.Tool = Capability.Tool(
        MCPServerView(
            sId = "tool-browser",
            name = "Browser",
            description = "Open web pages",
            spaceId = "space",
            server = MCPServer(
                sId = "server-browser",
                name = "Browser",
                description = "Open web pages",
            ),
        ),
    )
}
