package com.dust.mobile.core

import com.dust.mobile.core.model.User
import org.junit.Assert.assertEquals
import org.junit.Test

class UserDisplayTest {
    @Test
    fun `display name uses first and last name when present`() {
        val user = User(
            id = "u1",
            email = "ada@example.com",
            firstName = "Ada",
            lastName = "Lovelace",
        )

        assertEquals("Ada Lovelace", user.displayName)
    }

    @Test
    fun `display name falls back to email`() {
        val user = User(
            id = "u1",
            email = "ada@example.com",
        )

        assertEquals("ada@example.com", user.displayName)
    }
}
