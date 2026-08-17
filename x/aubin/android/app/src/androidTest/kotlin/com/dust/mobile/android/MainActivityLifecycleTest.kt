package com.dust.mobile.android

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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

        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            composeRule.waitForInbox()
            scenario.recreate()
            composeRule.waitForInbox()
        }
    }

    private fun androidx.compose.ui.test.junit4.ComposeTestRule.waitForInbox() {
        waitUntil(timeoutMillis = 10_000L) {
            onAllNodesWithText("Revenue Team").fetchSemanticsNodes().isNotEmpty()
        }
    }
}
