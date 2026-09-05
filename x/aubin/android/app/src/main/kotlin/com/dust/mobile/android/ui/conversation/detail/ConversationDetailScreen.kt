package com.dust.mobile.android.ui.conversation.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.ComposerBarSkeleton
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.composer.CapabilitySelectionSheet
import com.dust.mobile.android.ui.composer.ComposerBar
import com.dust.mobile.android.ui.composer.ComposerFocusCoordinator
import com.dust.mobile.android.ui.composer.KnowledgeSelectionSheet
import com.dust.mobile.android.ui.composer.MobileComposerScaffold
import com.dust.mobile.android.ui.composer.VoiceInputScreen
import com.dust.mobile.android.ui.composer.rememberComposerPlatformActions
import com.dust.mobile.android.ui.message.BlockedActionCard
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.User
import com.dust.mobile.core.model.inlineBlockedStateForMessage
import com.dust.mobile.core.model.steeredAgentHeaderMessageIds

@Composable
internal fun ConversationDetailScreen(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    conversation: Conversation,
    currentUserSId: String?,
    onOpenInBrowser: (() -> Unit)?,
    onTitleChanged: (String) -> Unit,
    onMarkedAsRead: () -> Unit,
    onNewConversation: (String?) -> Unit,
    onOpenContentFragment: (ContentFragment) -> Unit,
    onOpenFile: (GeneratedFile) -> Unit,
) {
    val detailViewModel: ConversationDetailViewModel = viewModel(
        key = "detail-${conversation.sId}",
        factory = factory {
            ConversationDetailViewModel(
                graph,
                tokenProvider,
                isLocalPreview,
                workspaceId,
                conversation,
                user,
                currentUserSId,
            )
        },
    )
    val state by detailViewModel.state.collectAsStateWithLifecycle()
    val speechState by detailViewModel.speechState.collectAsStateWithLifecycle()
    val voiceSessionState by detailViewModel.voiceSessionState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val hiddenAgentHeaderIds = remember(state.messages) {
        steeredAgentHeaderMessageIds(state.messages)
    }
    val messageListState = rememberLazyListState()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val composerFocus = remember(conversation.sId) { ComposerFocusCoordinator() }
    val platformActions = rememberComposerPlatformActions(
        isLocalPreview = isLocalPreview,
        focusCoordinator = composerFocus,
        onFilePicked = { file ->
            detailViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        },
        onStartVoiceInput = detailViewModel::startVoiceInput,
        onVoicePermissionDenied = detailViewModel::denyVoiceInput,
    )
    var showReplyCapabilitiesSelector by remember(conversation.sId) { mutableStateOf(false) }
    var showReplyKnowledgeSelector by remember(conversation.sId) { mutableStateOf(false) }

    LaunchedEffect(conversation.sId) {
        detailViewModel.load()
    }
    LaunchedEffect(state.conversationTitle) {
        val title = state.conversationTitle ?: return@LaunchedEffect
        onTitleChanged(title)
    }
    LaunchedEffect(state.isLoading, state.error, conversation.sId) {
        if (!state.isLoading && state.error == null && shouldMarkConversationAsReadOnOpen(conversation)) {
            onMarkedAsRead()
        }
    }
    ConversationScrollEffects(
        conversationId = conversation.sId,
        messageCount = state.messages.size,
        lastMessageId = state.messages.lastOrNull()?.id,
        hasMore = state.hasMore,
        hasRefreshError = state.refreshError != null,
        streamingMessageId = state.streamingMessageId,
        isComposerFocused = composerFocus.isInputFocused,
        isSending = state.isSending,
        listState = messageListState,
        onUserScroll = {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        },
    )
    DisposableEffect(lifecycleOwner, conversation.sId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                detailViewModel.resyncOnForeground()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            composerFocus.abandonFocusRestoration()
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
            detailViewModel.cancelAttachmentUploads()
            detailViewModel.cancelVoiceInput()
        }
    }
    val hasInlineBlockedState = remember(state.messages, state.streamingMessageId, state.blockedState) {
        state.messages.any { message ->
            inlineBlockedStateForMessage(message, state.streamingMessageId, state.blockedState) != null
        }
    }
    val isInitialLoading = state.isLoading && state.messages.isEmpty()
    val hasInitialError = state.error != null && state.messages.isEmpty()

    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        MobileComposerScaffold(
            bottomBar = {
                when {
                    isInitialLoading -> ComposerBarSkeleton()
                    !hasInitialError -> Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.background),
                    ) {
                        BlockedActionCard(
                            blockedState = state.blockedState.takeUnless { hasInlineBlockedState },
                            isLoading = state.isValidatingAction,
                            error = state.actionError.takeUnless { hasInlineBlockedState },
                            onValidate = detailViewModel::validateAction,
                            onAnswer = detailViewModel::answerQuestion,
                            onOpenInBrowser = onOpenInBrowser,
                            currentUserSId = currentUserSId,
                        )
                        ComposerBar(
                            text = state.replyText,
                            onTextChange = detailViewModel::updateReply,
                            focusCoordinator = composerFocus,
                            agents = state.agents,
                            selectedAgent = state.selectedReplyAgent,
                            onSelectAgent = detailViewModel::selectReplyAgent,
                            attachments = state.attachments,
                            onRemoveAttachment = detailViewModel::removeAttachment,
                            availableCapabilities = state.availableCapabilities,
                            selectedCapabilities = state.selectedCapabilities,
                            onRemoveCapability = detailViewModel::toggleReplyCapability,
                            isLoadingSkills = state.isLoadingSkills,
                            onSelectSkill = detailViewModel::selectReplySlashSkill,
                            selectedKnowledgeItems = state.selectedKnowledgeItems,
                            onRemoveKnowledgeItem = detailViewModel::toggleReplyKnowledgeItem,
                            enabled = !speechState.isBusy && !state.isSending && state.pendingOutboxId == null,
                            textInputEnabled = !speechState.isBusy && state.pendingOutboxId == null,
                            canSend = state.canSendReply,
                            isSending = state.isSending,
                            error = state.error?.takeIf { state.messages.isNotEmpty() },
                            onAddPhoto = platformActions.addPhoto,
                            onAddFile = platformActions.addFile,
                            onReceiveAttachments = platformActions.addReceivedAttachments,
                            onShowCapabilities = { showReplyCapabilitiesSelector = true },
                            onShowKnowledge = { showReplyKnowledgeSelector = true },
                            onNewConversation = {
                                onNewConversation(state.selectedReplyAgent?.sId)
                            },
                            onVoice = platformActions.startVoiceInput,
                            onSend = detailViewModel::sendReply,
                        )
                    }
                }
            },
        ) { contentPadding ->
            ConversationDetailContent(
                state = state,
                user = user,
                currentUserSId = currentUserSId,
                hiddenAgentHeaderIds = hiddenAgentHeaderIds,
                listState = messageListState,
                contentPadding = contentPadding,
                onRetryLoad = detailViewModel::load,
                onLoadMore = detailViewModel::loadMore,
                onOpenContentFragment = onOpenContentFragment,
                loadContentFragmentImage = detailViewModel::loadContentFragmentImage,
                onOpenFile = onOpenFile,
                onRetryMessage = detailViewModel::retryMessage,
                onValidateAction = detailViewModel::validateAction,
                onAnswerQuestion = detailViewModel::answerQuestion,
                onOpenInBrowser = onOpenInBrowser,
            )
        }
        if (voiceSessionState.isActive) {
            VoiceInputScreen(
                state = speechState,
                text = state.replyText,
                canSend = state.canSendReply,
                displayText = when (voiceSessionState.phase) {
                    VoiceSessionPhase.LISTENING,
                    VoiceSessionPhase.FINALIZING,
                    -> state.replyText
                    VoiceSessionPhase.PAUSED -> voiceSessionState.displayText.ifBlank {
                        state.replyText
                    }
                    else -> voiceSessionState.displayText
                },
                statusText = voiceSessionState.statusText,
                statusIsError = voiceSessionState.statusIsError,
                isWaitingForResponse = voiceSessionState.isWaitingForAgent,
                isSpeaking = voiceSessionState.isSpeaking,
                canStartListening = voiceSessionState.canStartListening,
                agentName = state.selectedReplyAgent?.name,
                agentAvatarUrl = state.selectedReplyAgent?.pictureUrl,
                onStart = platformActions.startVoiceInput,
                onStop = detailViewModel::stopVoiceInput,
                onExit = detailViewModel::cancelVoiceInput,
                onSend = detailViewModel::sendVoiceReply,
            )
        }
    }
    if (showReplyCapabilitiesSelector) {
        CapabilitySelectionSheet(
            capabilities = state.availableCapabilities,
            selected = state.selectedCapabilities,
            onDismiss = {
                showReplyCapabilitiesSelector = false
                composerFocus.finishInterruption()
            },
            onSelect = { capability ->
                detailViewModel.toggleReplyCapability(capability)
                showReplyCapabilitiesSelector = false
                composerFocus.finishInterruption()
            },
        )
    }
    if (showReplyKnowledgeSelector) {
        KnowledgeSelectionSheet(
            query = state.knowledgeQuery,
            results = state.knowledgeResults,
            selected = state.selectedKnowledgeItems,
            isSearching = state.isSearchingKnowledge,
            onQueryChange = detailViewModel::updateReplyKnowledgeQuery,
            onDismiss = {
                showReplyKnowledgeSelector = false
                composerFocus.finishInterruption()
            },
            onSelect = { item ->
                detailViewModel.toggleReplyKnowledgeItem(item)
                showReplyKnowledgeSelector = false
                composerFocus.finishInterruption()
            },
        )
    }
}
