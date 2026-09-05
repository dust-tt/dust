package com.dust.mobile.android.ui.message

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.dust.mobile.android.ui.theme.DustTheme
import com.dust.mobile.core.model.UserQuestion
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.UserQuestionOption
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UserQuestionInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun answerSurvivesSavedStateRestoration() {
        var submitted: UserQuestionAnswer? = null
        val restoration = StateRestorationTester(composeRule)
        restoration.setContent {
            DustTheme {
                UserQuestionCard(
                    question = UserQuestion("Which audience?", listOf(UserQuestionOption("Customers")), true),
                    isLoading = false,
                    canRespond = true,
                    onAnswer = { submitted = it },
                )
            }
        }
        composeRule.onNodeWithText("Customers").performClick()
        composeRule.onNode(hasSetTextAction()).performTextInput("Include the support team")
        restoration.emulateSavedInstanceStateRestore()
        composeRule.onNodeWithText("Send").performClick()

        composeRule.runOnIdle {
            assertEquals(listOf(0), submitted?.selectedOptions)
            assertEquals("Include the support team", submitted?.customResponse)
        }
    }
}
