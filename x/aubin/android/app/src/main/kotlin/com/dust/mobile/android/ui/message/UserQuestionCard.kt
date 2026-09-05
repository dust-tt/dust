package com.dust.mobile.android.ui.message

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.action
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.contentStrong
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.UserQuestion
import com.dust.mobile.core.model.UserQuestionAnswer
import com.dust.mobile.core.model.buildUserQuestionAnswer

@Composable
internal fun UserQuestionCard(
    question: UserQuestion,
    isLoading: Boolean,
    canRespond: Boolean,
    onAnswer: (UserQuestionAnswer) -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    var selectedOptions by rememberSaveable(question) { mutableStateOf<Set<Int>>(emptySet()) }
    var customResponse by rememberSaveable(question) { mutableStateOf("") }
    val answer = remember(selectedOptions, customResponse) {
        buildUserQuestionAnswer(selectedOptions, customResponse)
    }
    val submitAnswer: (UserQuestionAnswer) -> Unit = { response ->
        if (!isLoading) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
            onAnswer(response)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(DustSpacing.medium)) {
        Text(question.question, style = MaterialTheme.typography.labelLarge)
        if (!canRespond) {
            BlockedWaitingView("Waiting for a teammate to respond.")
            return@Column
        }
        question.options.forEachIndexed { index, option ->
            val isSelected = index in selectedOptions
            val selectOption = {
                focusManager.clearFocus(force = true)
                keyboardController?.hide()
                selectedOptions = if (question.multiSelect) {
                    if (isSelected) selectedOptions - index else selectedOptions + index
                } else {
                    setOf(index)
                }
            }
            val selectionModifier = if (question.multiSelect) {
                Modifier.toggleable(isSelected, enabled = !isLoading, role = Role.Checkbox) { selectOption() }
            } else {
                Modifier.selectable(isSelected, enabled = !isLoading, role = Role.RadioButton, onClick = selectOption)
            }
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = DustDimensions.controlHeight)
                    .then(selectionModifier),
                shape = RoundedCornerShape(DustRadii.control),
                color = MaterialTheme.colorScheme.interactiveSurface,
                border = BorderStroke(
                    1.dp,
                    if (isSelected) MaterialTheme.colorScheme.action else Color.Transparent,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(DustSpacing.medium),
                    horizontalArrangement = Arrangement.spacedBy(DustSpacing.small),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        painter = painterResource(
                            when {
                                question.multiSelect && isSelected -> R.drawable.ic_check_box_24
                                question.multiSelect -> R.drawable.ic_check_box_outline_blank_24
                                isSelected -> R.drawable.ic_check_circle_24
                                else -> R.drawable.ic_radio_unchecked_24
                            },
                        ),
                        contentDescription = null,
                        modifier = Modifier.size(DustDimensions.actionIcon),
                        tint = if (isSelected) {
                            MaterialTheme.colorScheme.action
                        } else {
                            MaterialTheme.colorScheme.contentMuted
                        },
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
                    ) {
                        Text(option.label, style = MaterialTheme.typography.labelMedium)
                        option.description?.takeIf { it.isNotBlank() }?.let { description ->
                            Text(
                                text = description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.contentMuted,
                            )
                        }
                    }
                }
            }
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(DustRadii.control),
            color = MaterialTheme.colorScheme.interactiveSurface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
        ) {
            BasicTextField(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = DustDimensions.controlHeight)
                    .padding(DustSpacing.medium),
                value = customResponse,
                onValueChange = { customResponse = it },
                enabled = !isLoading,
                minLines = 1,
                maxLines = 4,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Send,
                ),
                keyboardActions = KeyboardActions(onSend = { answer?.let(submitAnswer) }),
                textStyle = MaterialTheme.typography.bodySmall.copy(
                    color = MaterialTheme.colorScheme.contentStrong,
                ),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.action),
                decorationBox = { innerTextField ->
                    Box {
                        if (customResponse.isEmpty()) {
                            Text(
                                text = "Type something else",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.contentMuted,
                            )
                        }
                        innerTextField()
                    }
                },
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.subtleBorder)
        DustButton(
            label = "Send",
            enabled = answer != null,
            loading = isLoading,
            onClick = { answer?.let(submitAnswer) },
            modifier = Modifier.fillMaxWidth(),
        )
        DustButton(
            label = "Skip",
            enabled = !isLoading,
            onClick = {
                submitAnswer(UserQuestionAnswer(selectedOptions = emptyList(), customResponse = null))
            },
            modifier = Modifier.fillMaxWidth(),
            variant = DustButtonVariant.NeutralText,
        )
    }
}
