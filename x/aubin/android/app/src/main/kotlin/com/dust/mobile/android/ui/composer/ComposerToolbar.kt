package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustIconButton
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.LightAgentConfiguration

@Composable
internal fun ComposerToolbar(
    agents: List<LightAgentConfiguration>,
    selectedAgent: LightAgentConfiguration?,
    enabled: Boolean,
    onSelectAgent: (LightAgentConfiguration) -> Unit,
    onBeginFocusInterruption: () -> Unit,
    onFinishFocusInterruption: () -> Unit,
    onAbandonFocus: () -> Unit,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onShowCapabilities: () -> Unit,
    onShowKnowledge: () -> Unit,
    onNewConversation: (() -> Unit)?,
    canSend: Boolean,
    isSending: Boolean,
    suggestionSelectionActive: Boolean,
    suggestionSelectionLabel: String?,
    onVoice: () -> Unit,
    onPrimaryAction: () -> Unit,
) {
    Row(
        modifier = Modifier.padding(
            start = DustSpacing.extraSmall,
            end = DustSpacing.extraSmall,
            top = DustSpacing.extraSmall,
            bottom = DustSpacing.small,
        ),
        horizontalArrangement = Arrangement.spacedBy(DustSpacing.extraSmall),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentSelector(
            agents = agents,
            selected = selectedAgent,
            enabled = enabled,
            onPickerOpen = onBeginFocusInterruption,
            onPickerClose = onFinishFocusInterruption,
            onSelect = onSelectAgent,
        )
        DustIconButton(
            enabled = enabled,
            iconRes = R.drawable.ic_tune_24,
            contentDescription = "Add tools and skills",
            onClick = {
                onBeginFocusInterruption()
                onShowCapabilities()
            },
        )
        ComposerContextButton(
            enabled = enabled,
            onMenuOpen = onBeginFocusInterruption,
            onMenuDismiss = onFinishFocusInterruption,
            onAddPhoto = {
                onBeginFocusInterruption()
                onAddPhoto()
            },
            onAddFile = {
                onBeginFocusInterruption()
                onAddFile()
            },
            onShowCapabilities = {
                onBeginFocusInterruption()
                onShowCapabilities()
            },
            onShowKnowledge = {
                onBeginFocusInterruption()
                onShowKnowledge()
            },
        )
        onNewConversation?.let { startNewConversation ->
            DustIconButton(
                enabled = enabled,
                iconRes = R.drawable.ic_chat_plus_24,
                contentDescription = "New conversation",
                onClick = {
                    onAbandonFocus()
                    startNewConversation()
                },
            )
        }
        Spacer(Modifier.weight(1f))
        ComposerActionButton(
            canSend = canSend,
            enabled = enabled,
            isSending = isSending,
            suggestionSelectionActive = suggestionSelectionActive,
            suggestionSelectionLabel = suggestionSelectionLabel,
            onVoice = {
                onAbandonFocus()
                onVoice()
            },
            onSend = onPrimaryAction,
        )
    }
}
