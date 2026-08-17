package com.dust.mobile.android.ui.composer

import androidx.compose.runtime.Composable
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.common.DustIconButtonVariant

@Composable
internal fun ComposerActionButton(
    canSend: Boolean,
    enabled: Boolean,
    isSending: Boolean,
    suggestionSelectionActive: Boolean = false,
    suggestionSelectionLabel: String? = null,
    onVoice: () -> Unit,
    onSend: () -> Unit,
) {
    val canSelectSuggestion = suggestionSelectionActive &&
        suggestionSelectionLabel != null &&
        enabled &&
        !isSending
    val canSendMessage = !suggestionSelectionActive && canSend && enabled && !isSending
    val isPrimaryAction = canSelectSuggestion || canSendMessage || isSending
    val isActionEnabled = enabled && !isSending && (!suggestionSelectionActive || canSelectSuggestion)
    val description = when {
        isSending -> "Sending"
        canSelectSuggestion -> "Select $suggestionSelectionLabel"
        suggestionSelectionActive -> "No matching suggestion"
        canSendMessage -> "Send"
        else -> "Voice input"
    }

    DustIconButton(
        onClick = if (canSelectSuggestion || canSendMessage) onSend else onVoice,
        iconRes = when {
            suggestionSelectionActive -> R.drawable.ic_check_24
            canSendMessage || isSending -> R.drawable.ic_arrow_up_24
            else -> R.drawable.ic_mic_24
        },
        contentDescription = description,
        enabled = isActionEnabled || isSending,
        loading = isSending,
        variant = if (isPrimaryAction) {
            DustIconButtonVariant.Primary
        } else {
            DustIconButtonVariant.Plain
        },
    )
}
