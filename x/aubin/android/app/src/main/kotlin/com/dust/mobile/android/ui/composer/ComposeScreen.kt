package com.dust.mobile.android.ui.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.share.IncomingShare
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun ComposeScreen(
    graph: AppGraph,
    user: User,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    spaceId: String? = null,
    preferredAgentId: String? = null,
    incomingShare: IncomingShare? = null,
    onShareHandled: () -> Unit = {},
    onCreated: (Conversation) -> Unit,
) {
    val composeViewModel: ComposeViewModel = viewModel(
        key = "compose-$workspaceId-${spaceId.orEmpty()}",
        factory = factory { ComposeViewModel(graph, tokenProvider, isLocalPreview, workspaceId, user, spaceId) },
    )
    val state by composeViewModel.state.collectAsStateWithLifecycle()
    val speechState by composeViewModel.speechState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val context = LocalContext.current
    val composerFocus = remember(workspaceId, spaceId) { ComposerFocusCoordinator() }
    val platformActions = rememberComposerPlatformActions(
        isLocalPreview = isLocalPreview,
        focusCoordinator = composerFocus,
        onFilePicked = { file ->
            composeViewModel.addAttachment(file.fileName, file.contentType, file.data, file.thumbnailData)
        },
        onStartVoiceInput = composeViewModel::startVoiceInput,
        onVoicePermissionDenied = composeViewModel::denyVoiceInput,
    )
    LaunchedEffect(state.isDraftRestored, state.pendingOutboxId, incomingShare?.id) {
        if (state.isDraftRestored && state.pendingOutboxId == null && incomingShare == null) {
            composerFocus.requestFocus()
        }
    }
    LaunchedEffect(state.isDraftRestored, preferredAgentId) {
        if (state.isDraftRestored && preferredAgentId != null) {
            composeViewModel.preferAgent(preferredAgentId, shortcutId = null)
            composerFocus.requestFocus()
        }
    }
    LaunchedEffect(state.createdConversation?.sId) {
        state.createdConversation?.let { conversation ->
            onCreated(conversation)
            composeViewModel.consumeCreatedConversation()
        }
    }
    LaunchedEffect(incomingShare?.id) {
        val share = incomingShare ?: return@LaunchedEffect
        composeViewModel.preferAgent(share.targetAgentId, share.shortcutId)
        val files = withContext(Dispatchers.IO) {
            share.uris.mapNotNull { uri -> readPickedFileSafely(context, uri) }
        }
        composeViewModel.importSharedContent(
            shareId = share.id,
            text = share.text,
            files = files,
            failedFileCount = share.uris.size - files.size,
        )
        onShareHandled()
        composerFocus.requestFocus()
    }
    DisposableEffect(composeViewModel, composerFocus) {
        onDispose {
            composerFocus.abandonFocusRestoration()
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }
    var showCapabilities by remember(workspaceId, spaceId) { mutableStateOf(false) }
    var showKnowledge by remember(workspaceId, spaceId) { mutableStateOf(false) }
    Box(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        MobileComposerScaffold(
            bottomBar = {
                ComposerBar(
                    text = state.text,
                    onTextChange = composeViewModel::updateText,
                    focusCoordinator = composerFocus,
                    agents = state.agents,
                    selectedAgent = state.selectedAgent,
                    onSelectAgent = composeViewModel::selectAgent,
                    attachments = state.attachments,
                    onRemoveAttachment = composeViewModel::removeAttachment,
                    availableCapabilities = state.availableCapabilities,
                    selectedCapabilities = state.selectedCapabilities,
                    onRemoveCapability = composeViewModel::toggleCapability,
                    isLoadingSkills = state.isLoadingSkills,
                    onSelectSkill = composeViewModel::selectSlashSkill,
                    selectedKnowledgeItems = state.selectedKnowledgeItems,
                    onRemoveKnowledgeItem = composeViewModel::toggleKnowledgeItem,
                    enabled = !state.isSending && state.pendingOutboxId == null && !speechState.isBusy,
                    textInputEnabled = !state.isSending && state.pendingOutboxId == null && !speechState.isBusy,
                    canSend = state.canSend,
                    isSending = state.isSending,
                    error = state.error,
                    onAddPhoto = platformActions.addPhoto,
                    onAddFile = platformActions.addFile,
                    onReceiveAttachments = platformActions.addReceivedAttachments,
                    onShowCapabilities = { showCapabilities = true },
                    onShowKnowledge = { showKnowledge = true },
                    onVoice = platformActions.startVoiceInput,
                    onSend = composeViewModel::send,
                )
            },
        ) { contentPadding ->
            ComposeAgentIntro(
                agent = state.selectedAgent,
                isLoading = state.isLoadingOptions && state.selectedAgent == null,
                modifier = Modifier.padding(contentPadding),
            )
        }
        if (speechState.isPresented) {
            VoiceInputScreen(
                state = speechState,
                text = state.text,
                canSend = state.canSend,
                agentName = state.selectedAgent?.name,
                agentAvatarUrl = state.selectedAgent?.pictureUrl,
                onStart = platformActions.startVoiceInput,
                onStop = composeViewModel::stopVoiceInput,
                onExit = composeViewModel::cancelVoiceInput,
                onSend = {
                    composeViewModel.cancelVoiceInput()
                    composeViewModel.send()
                },
            )
        }
    }
    if (showCapabilities) {
        CapabilitySelectionSheet(
            capabilities = state.availableCapabilities,
            selected = state.selectedCapabilities,
            onDismiss = {
                showCapabilities = false
                composerFocus.finishInterruption()
            },
            onSelect = { capability ->
                composeViewModel.toggleCapability(capability)
                showCapabilities = false
                composerFocus.finishInterruption()
            },
        )
    }
    if (showKnowledge) {
        KnowledgeSelectionSheet(
            query = state.knowledgeQuery,
            results = state.knowledgeResults,
            selected = state.selectedKnowledgeItems,
            isSearching = state.isSearchingKnowledge,
            onQueryChange = composeViewModel::updateKnowledgeQuery,
            onDismiss = {
                showKnowledge = false
                composerFocus.finishInterruption()
            },
            onSelect = { item ->
                composeViewModel.toggleKnowledgeItem(item)
                showKnowledge = false
                composerFocus.finishInterruption()
            },
        )
    }
}
