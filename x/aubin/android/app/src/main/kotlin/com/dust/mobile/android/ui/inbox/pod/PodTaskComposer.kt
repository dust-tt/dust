package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.boundedSurface
import com.dust.mobile.android.ui.theme.contentMuted
import com.dust.mobile.android.ui.theme.subtleBorder

@Composable
internal fun PodTaskComposer(
    text: String,
    isSaving: Boolean,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val canSubmit = text.isNotBlank() && !isSaving
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = DustSpacing.medium, vertical = DustSpacing.small),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(DustRadii.control),
        color = MaterialTheme.colorScheme.boundedSurface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = DustDimensions.controlHeight)
                .padding(start = DustSpacing.medium, end = DustSpacing.extraSmall),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = DustSpacing.medium),
                enabled = !isSaving,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                ),
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Send,
                ),
                keyboardActions = KeyboardActions(
                    onSend = { if (canSubmit) onSubmit() },
                ),
                singleLine = true,
                decorationBox = { innerTextField ->
                    if (text.isEmpty()) {
                        Text(
                            text = "Add a task",
                            color = MaterialTheme.colorScheme.contentMuted,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                    innerTextField()
                },
            )
            DustIconButton(
                onClick = onSubmit,
                iconRes = R.drawable.ic_arrow_up_24,
                contentDescription = "Add task",
                enabled = canSubmit,
                loading = isSaving,
                variant = if (canSubmit) DustIconButtonVariant.Primary else DustIconButtonVariant.Plain,
            )
        }
    }
}
