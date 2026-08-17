package com.dust.mobile.android.ui.composer

import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.ui.theme.DustDimensions
import com.dust.mobile.android.ui.theme.DustRadii
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.interactiveSurface
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.model.Capability
import com.dust.mobile.core.model.KnowledgeItem
import com.dust.mobile.core.model.LightAgentConfiguration
import com.dust.mobile.core.model.activeAgentMentionQuery
import com.dust.mobile.core.model.activeSkillSlashQuery
import com.dust.mobile.core.model.filterAgents
import com.dust.mobile.core.model.filterSkillSlashSuggestions

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ComposerBar(
    text: String,
    onTextChange: (String) -> Unit,
    focusCoordinator: ComposerFocusCoordinator,
    agents: List<LightAgentConfiguration>,
    selectedAgent: LightAgentConfiguration?,
    onSelectAgent: (LightAgentConfiguration) -> Unit,
    attachments: List<AttachmentDraft>,
    onRemoveAttachment: (String) -> Unit,
    availableCapabilities: List<Capability>,
    selectedCapabilities: List<Capability>,
    onRemoveCapability: (Capability) -> Unit,
    isLoadingSkills: Boolean,
    onSelectSkill: (Capability.SkillCapability) -> Unit,
    selectedKnowledgeItems: List<KnowledgeItem>,
    onRemoveKnowledgeItem: (KnowledgeItem) -> Unit,
    enabled: Boolean,
    textInputEnabled: Boolean = enabled,
    canSend: Boolean,
    isSending: Boolean,
    error: String?,
    onAddPhoto: () -> Unit,
    onAddFile: () -> Unit,
    onReceiveAttachments: (List<Uri>) -> Unit,
    onShowCapabilities: () -> Unit,
    onShowKnowledge: () -> Unit,
    onNewConversation: (() -> Unit)? = null,
    onVoice: () -> Unit,
    onSend: () -> Unit,
    placeholder: String = "Ask anything or call an agent with @",
) {
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val isWindowFocused = LocalWindowInfo.current.isWindowFocused
    val isImeVisible = WindowInsets.isImeVisible
    var handledFocusRequestId by remember { mutableIntStateOf(0) }
    val beginFocusInterruption: () -> Unit = {
        focusCoordinator.beginInterruption(isImeVisible)
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
        Unit
    }
    val finishFocusInterruption: () -> Unit = {
        focusCoordinator.finishInterruption()
    }
    val abandonFocus: () -> Unit = {
        focusCoordinator.abandonFocusRestoration()
        focusManager.clearFocus(force = true)
        keyboardController?.hide()
        Unit
    }
    val submitMessage: () -> Unit = {
        if (enabled && canSend && !isSending) {
            onSend()
        }
    }
    val mentionQuery = activeAgentMentionQuery(text)
    val agentSuggestions = remember(agents, mentionQuery?.query) {
        mentionQuery?.let { filterAgents(agents, it.query).take(6) }.orEmpty()
    }
    val slashQuery = activeSkillSlashQuery(text)
    val slashSuggestions = remember(
        availableCapabilities,
        selectedCapabilities,
        slashQuery?.query,
    ) {
        slashQuery?.let {
            filterSkillSlashSuggestions(
                capabilities = availableCapabilities,
                selected = selectedCapabilities,
                query = it.query,
            )
        }.orEmpty()
    }
    val showSkillSlashSuggestions = enabled &&
        focusCoordinator.isInputFocused &&
        slashQuery != null &&
        mentionQuery == null
    val showAgentMentionSuggestions = enabled &&
        focusCoordinator.isInputFocused &&
        mentionQuery != null
    val selectMentionAgent: (LightAgentConfiguration) -> Unit = { agent ->
        onSelectAgent(agent)
        focusRequester.requestFocus()
        keyboardController?.show()
    }
    val selectSlashSkill: (Capability.SkillCapability) -> Unit = { skill ->
        onSelectSkill(skill)
        focusRequester.requestFocus()
        keyboardController?.show()
    }
    val performPrimaryAction: () -> Unit = {
        when {
            showAgentMentionSuggestions -> agentSuggestions.firstOrNull()?.let(selectMentionAgent)
            showSkillSlashSuggestions -> slashSuggestions.firstOrNull()?.let(selectSlashSkill)
            else -> submitMessage()
        }
    }

    LaunchedEffect(focusCoordinator.focusRequestId, enabled, isWindowFocused) {
        val requestId = focusCoordinator.focusRequestId
        if (enabled && isWindowFocused && requestId > handledFocusRequestId) {
            repeat(4) {
                withFrameNanos { }
                focusRequester.requestFocus()
                withFrameNanos { }
                if (focusCoordinator.isInputFocused) {
                    handledFocusRequestId = requestId
                    if (focusCoordinator.focusRequestShouldShowKeyboard) {
                        keyboardController?.show()
                    } else {
                        keyboardController?.hide()
                    }
                    return@LaunchedEffect
                }
            }
        }
    }
    LaunchedEffect(isImeVisible) {
        if (focusCoordinator.onImeVisibilityChanged(isImeVisible)) {
            // Android can dismiss the IME before BackHandler receives the system Back event.
            focusManager.clearFocus(force = true)
        }
    }
    DisposableEffect(focusCoordinator) {
        onDispose { focusCoordinator.onInputFocusChanged(false) }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        if (showAgentMentionSuggestions) {
            AgentMentionSuggestions(
                query = mentionQuery.query,
                suggestions = agentSuggestions,
                selectedAgentId = selectedAgent?.sId,
                onSelect = selectMentionAgent,
            )
        } else if (showSkillSlashSuggestions) {
            SkillSlashSuggestions(
                query = slashQuery.query,
                suggestions = slashSuggestions,
                isLoading = isLoadingSkills,
                onSelect = selectSlashSkill,
            )
        }
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = DustDimensions.bottomBarHorizontalPadding,
                    vertical = DustSpacing.small,
                ),
            shape = RoundedCornerShape(DustRadii.control),
            color = MaterialTheme.colorScheme.interactiveSurface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.subtleBorder),
            shadowElevation = 0.dp,
        ) {
            Column {
                error?.takeIf { it.isNotBlank() }?.let { message ->
                    Text(
                        message,
                        modifier = Modifier.padding(start = 16.dp, top = 10.dp, end = 16.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                ComposerSelections(
                    attachments = attachments,
                    selectedCapabilities = selectedCapabilities,
                    selectedKnowledgeItems = selectedKnowledgeItems,
                    onRemoveAttachment = onRemoveAttachment,
                    onRemoveCapability = onRemoveCapability,
                    onRemoveKnowledgeItem = onRemoveKnowledgeItem,
                )
                ComposerTextInput(
                    text = text,
                    onTextChange = onTextChange,
                    enabled = textInputEnabled,
                    placeholder = placeholder,
                    focusRequester = focusRequester,
                    onFocusChanged = focusCoordinator::onInputFocusChanged,
                    onSubmit = performPrimaryAction,
                    onReceiveAttachments = onReceiveAttachments,
                )
                ComposerToolbar(
                    agents = agents,
                    selectedAgent = selectedAgent,
                    enabled = enabled,
                    onSelectAgent = onSelectAgent,
                    onBeginFocusInterruption = beginFocusInterruption,
                    onFinishFocusInterruption = finishFocusInterruption,
                    onAbandonFocus = abandonFocus,
                    onAddPhoto = onAddPhoto,
                    onAddFile = onAddFile,
                    onShowCapabilities = onShowCapabilities,
                    onShowKnowledge = onShowKnowledge,
                    onNewConversation = onNewConversation,
                    canSend = canSend,
                    isSending = isSending,
                    suggestionSelectionActive = showAgentMentionSuggestions || showSkillSlashSuggestions,
                    suggestionSelectionLabel = when {
                        showAgentMentionSuggestions -> agentSuggestions.firstOrNull()?.name
                        showSkillSlashSuggestions -> slashSuggestions.firstOrNull()?.displayName
                        else -> null
                    },
                    onVoice = onVoice,
                    onPrimaryAction = performPrimaryAction,
                )
            }
        }
    }
}
