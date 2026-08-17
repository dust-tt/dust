package com.dust.mobile.android.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun DustSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    showBackButton: Boolean = false,
    onBack: (() -> Unit)? = null,
    onFocusChanged: (Boolean) -> Unit = {},
    onSearch: () -> Unit = {},
    focusRequester: FocusRequester? = null,
) {
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    var isFocused by remember { mutableStateOf(false) }

    fun finishSearch() {
        onSearch()
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
    }

    Surface(
        modifier = modifier.height(DustDimensions.controlHeight),
        shape = RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.interactiveSurface,
        border = BorderStroke(
            width = 1.dp,
            color = if (isFocused) {
                MaterialTheme.colorScheme.action
            } else {
                MaterialTheme.colorScheme.subtleBorder
            },
        ),
    ) {
        BasicTextField(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    focusRequester?.let { Modifier.focusRequester(it) } ?: Modifier,
                )
                .onFocusChanged { state ->
                    if (isFocused != state.isFocused) {
                        isFocused = state.isFocused
                        onFocusChanged(state.isFocused)
                    }
                },
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { finishSearch() }),
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = MaterialTheme.colorScheme.contentStrong,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.action),
            decorationBox = { innerTextField ->
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(
                            start = if (showBackButton) DustSpacing.extraSmall else DustSpacing.medium,
                            end = if (value.isNotEmpty()) DustSpacing.extraSmall else DustSpacing.medium,
                        ),
                    horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (showBackButton) {
                        DustIconButton(
                            onClick = {
                                if (onBack != null) {
                                    onBack()
                                } else {
                                    finishSearch()
                                }
                            },
                            iconRes = R.drawable.ic_arrow_back_24,
                            contentDescription = "Exit search",
                        )
                    } else {
                        Icon(
                            painter = painterResource(R.drawable.ic_search_24),
                            contentDescription = null,
                            modifier = Modifier.size(DustDimensions.actionIcon),
                            tint = MaterialTheme.colorScheme.contentMuted,
                        )
                    }
                    Box(
                        modifier = Modifier.weight(1f),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.contentMuted,
                            )
                        }
                        innerTextField()
                    }
                    if (value.isNotEmpty()) {
                        DustIconButton(
                            onClick = { onValueChange("") },
                            iconRes = R.drawable.ic_close_24,
                            contentDescription = "Clear search",
                        )
                    }
                }
            },
        )
    }
}
