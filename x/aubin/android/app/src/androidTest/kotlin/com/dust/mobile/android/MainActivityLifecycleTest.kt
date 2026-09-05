package com.dust.mobile.android

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.dust.mobile.android.data.persistence.PersistedDestination
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityLifecycleTest {
    @get:Rule
    val composeRule = createEmptyComposeRule()

    @Test
    fun localPreviewRemainsLoadedAfterActivityRecreation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("dust://local-preview"), context, MainActivity::class.java)

        val store = (context.applicationContext as DustApplication).graph.persistedStateStore
        val previous = runBlocking { store.current() }
        runBlocking { store.update { it.copy(selectedWorkspaceId = null, destination = PersistedDestination()) } }
        try {
            ActivityScenario.launch<MainActivity>(intent).use { scenario ->
                composeRule.waitForInbox()
                composeRule.onNode(hasSetTextAction()).performTextInput("briefing")
                composeRule.waitForSearchResults()
                scenario.recreate()
                composeRule.waitForInbox()
                composeRule.waitForSearchResults()
            }
        } finally {
            runBlocking { store.update { previous } }
        }
    }

    private fun androidx.compose.ui.test.junit4.ComposeTestRule.waitForInbox() {
        waitUntil(timeoutMillis = 10_000L) {
            onAllNodesWithText("Revenue Team").fetchSemanticsNodes().isNotEmpty()
        }
    }
    private fun androidx.compose.ui.test.junit4.ComposeTestRule.waitForSearchResults() {
        waitUntil(timeoutMillis = 10_000L) {
            onAllNodesWithText("Search results").fetchSemanticsNodes().isNotEmpty() &&
                onAllNodesWithText("briefing").fetchSemanticsNodes().isNotEmpty()
        }
    }

}
