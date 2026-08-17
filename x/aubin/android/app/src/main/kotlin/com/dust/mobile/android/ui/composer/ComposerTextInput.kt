package com.dust.mobile.android.ui.composer

import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.KeyboardActionHandler
import androidx.compose.foundation.text.input.TextFieldDecorator
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import kotlinx.coroutines.flow.distinctUntilChanged

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ComposerTextInput(
    text: String,
    onTextChange: (String) -> Unit,
    enabled: Boolean,
    placeholder: String,
    focusRequester: FocusRequester,
    onFocusChanged: (Boolean) -> Unit,
    onSubmit: () -> Unit,
    onReceiveAttachments: (List<Uri>) -> Unit,
) {
    val textFieldState = rememberTextFieldState(initialText = text)
    val currentOnTextChange = rememberUpdatedState(onTextChange)
    val attachmentContentReceiver = rememberAttachmentContentReceiver(
        enabled = enabled,
        onReceiveAttachments = onReceiveAttachments,
    )

    LaunchedEffect(text) {
        if (textFieldState.text.toString() != text) {
            textFieldState.setTextAndPlaceCursorAtEnd(text)
        }
    }
    LaunchedEffect(textFieldState) {
        snapshotFlow { textFieldState.text.toString() }
            .distinctUntilChanged()
            .collect { currentOnTextChange.value(it) }
    }

    BasicTextField(
        state = textFieldState,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 40.dp, max = 120.dp)
            .contentReceiver(attachmentContentReceiver)
            .focusRequester(focusRequester)
            .onFocusChanged { onFocusChanged(it.isFocused) }
            .padding(horizontal = DustSpacing.medium, vertical = DustSpacing.small),
        enabled = enabled,
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Sentences,
            imeAction = ImeAction.Send,
        ),
        onKeyboardAction = KeyboardActionHandler { onSubmit() },
        lineLimits = TextFieldLineLimits.MultiLine(
            minHeightInLines = 1,
            maxHeightInLines = 6,
        ),
        textStyle = MaterialTheme.typography.bodyMedium.copy(
            color = if (enabled) {
                MaterialTheme.colorScheme.contentStrong
            } else {
                MaterialTheme.colorScheme.contentMuted
            },
        ),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.action),
        decorator = TextFieldDecorator { innerTextField ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (textFieldState.text.isEmpty()) {
                    Text(
                        placeholder,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.contentMuted,
                    )
                }
                innerTextField()
            }
        },
    )
}
