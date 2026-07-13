package com.dust.mobile.core

import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.favoriteLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AgentDisplayTest {
    @Test
    fun `favorite label is shown only for favorite agents`() {
        assertEquals("Favorite", agent(userFavorite = true).favoriteLabel())
        assertNull(agent(userFavorite = false).favoriteLabel())
    }

    private fun agent(userFavorite: Boolean) = LightAgentConfiguration(
        sId = "agent",
        name = "Research",
        description = "",
        scope = "global",
        userFavorite = userFavorite,
    )
}
