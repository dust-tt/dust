package com.dust.mobile.android.ui.composer

import android.content.ClipDescription
import android.net.Uri
import android.view.inputmethod.EditorInfo
import androidx.activity.ComponentActivity
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.dust.mobile.android.ui.theme.DustTheme
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ComposerRichContentInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun keyboardCanCommitScreenshotToComposer() {
        val focusRequester = FocusRequester()
        val receivedImages = AtomicReference<List<Uri>>(emptyList())

        composeRule.setContent {
            DustTheme {
                ComposerTextInput(
                    text = "",
                    onTextChange = {},
                    enabled = true,
                    placeholder = "Message",
                    focusRequester = focusRequester,
                    onFocusChanged = {},
                    onSubmit = {},
                    onReceiveAttachments = receivedImages::set,
                )
            }
        }
        composeRule.runOnIdle {
            focusRequester.requestFocus()
        }
        composeRule.waitForIdle()

        val editorInfo = EditorInfo()
        val inputConnection = composeRule.runOnUiThread {
            val focusedView = checkNotNull(composeRule.activity.currentFocus)
            checkNotNull(focusedView.onCreateInputConnection(editorInfo))
        }
        assertTrue(
            EditorInfoCompat.getContentMimeTypes(editorInfo).any { supportedType ->
                ClipDescription.compareMimeTypes("image/png", supportedType)
            },
        )

        val screenshotUri = Uri.parse("content://com.dust.mobile.test/screenshots/latest.png")
        val screenshot = InputContentInfoCompat(
            screenshotUri,
            ClipDescription("Screenshot", arrayOf("image/png")),
            null,
        )
        val committed = composeRule.runOnUiThread {
            InputConnectionCompat.commitContent(
                inputConnection,
                editorInfo,
                screenshot,
                0,
                null,
            )
        }

        assertTrue(committed)
        composeRule.waitForIdle()
        assertEquals(listOf(screenshotUri), receivedImages.get())
    }
}
