package com.dust.mobile.android.ui.inbox

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dust.mobile.android.R
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.factory
import com.dust.mobile.android.ui.common.motionEnabled
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.CatchUpSwipeAction
import com.dust.mobile.core.model.CitationReference
import com.dust.mobile.core.model.ContentFragment
import com.dust.mobile.core.model.Conversation
import com.dust.mobile.core.model.GeneratedFile
import com.dust.mobile.core.model.catchUpSwipeAction
import kotlinx.coroutines.launch

@Composable
internal fun CatchUpScreen(
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    currentUserEmail: String,
    conversations: List<Conversation>,
    sessionId: String,
    onDismiss: (Set<String>) -> Unit,
    onOpenConversation: (Set<String>, Conversation) -> Unit,
    onOpenContentFragment: (ContentFragment) -> Unit,
    onOpenFile: (GeneratedFile) -> Unit,
    onOpenCitation: (CitationReference) -> Unit,
) {
    val catchUpViewModel: CatchUpViewModel = viewModel(
        key = "catch-up-$workspaceId",
        factory = factory { CatchUpViewModel(graph, tokenProvider, isLocalPreview, workspaceId, conversations) },
    )
    LaunchedEffect(sessionId) { catchUpViewModel.startSession(sessionId, conversations) }
    val state by catchUpViewModel.state.collectAsStateWithLifecycle()
    val currentConversation = state.currentConversation
    val isMotionEnabled = motionEnabled()
    val density = LocalDensity.current
    val cardAnimationScope = rememberCoroutineScope()
    val cardExitDistancePx = with(density) { CATCH_UP_EXIT_DISTANCE_DP.dp.toPx() }
    val swipeThresholdPx = with(density) { CATCH_UP_SWIPE_THRESHOLD_DP.dp.toPx() }
    var cardOffsetPx by remember(currentConversation?.sId) { mutableFloatStateOf(0f) }
    var isCardAnimating by remember(currentConversation?.sId) { mutableStateOf(false) }

    fun animateCardTo(targetOffsetPx: Float, onComplete: () -> Unit = {}) {
        if (isCardAnimating) return
        if (!isMotionEnabled) {
            isCardAnimating = true
            if (targetOffsetPx == 0f) {
                cardOffsetPx = 0f
            }
            onComplete()
            isCardAnimating = false
            return
        }
        cardAnimationScope.launch {
            isCardAnimating = true
            animate(
                initialValue = cardOffsetPx,
                targetValue = targetOffsetPx,
                animationSpec = tween(
                    durationMillis = if (targetOffsetPx == 0f) {
                        CATCH_UP_CARD_RETURN_MS
                    } else {
                        CATCH_UP_CARD_EXIT_MS
                    },
                    easing = if (targetOffsetPx == 0f) {
                        FastOutSlowInEasing
                    } else {
                        FastOutLinearInEasing
                    },
                ),
            ) { value, _ ->
                cardOffsetPx = value
            }
            if (targetOffsetPx == 0f) {
                cardOffsetPx = 0f
            }
            onComplete()
            isCardAnimating = false
        }
    }

    fun openCurrentConversation() {
        val conversation = currentConversation ?: return
        catchUpViewModel.dismiss { markedIds -> onOpenConversation(markedIds, conversation) }
    }

    fun animateCardAction(action: CatchUpSwipeAction) {
        when (action) {
            CatchUpSwipeAction.MARK_AS_READ -> {
                if (currentConversation?.actionRequired == true) {
                    animateCardTo(0f, ::openCurrentConversation)
                } else {
                    animateCardTo(cardExitDistancePx, catchUpViewModel::markAsRead)
                }
            }
            CatchUpSwipeAction.KEEP_FOR_LATER -> animateCardTo(-cardExitDistancePx, catchUpViewModel::keepForLater)
        }
    }

    BackHandler { catchUpViewModel.dismiss(onDismiss) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        CatchUpHeader(
            progress = state.progressText,
            onClose = { catchUpViewModel.dismiss(onDismiss) },
            onUndo = (catchUpViewModel::undoLastReview).takeIf { state.currentIndex > 0 },
            enabled = !state.isFlushing && !isCardAnimating,
        )

        Box(modifier = Modifier.weight(1f)) {
            when {
                state.isDone -> DustFeedbackState(
                    iconRes = R.drawable.ic_check_circle_24,
                    title = "Review complete",
                    message = if (state.keptForLaterCount == 0) {
                        "You're ready to mark ${state.markedAsReadIds.size} as read."
                    } else {
                        "${state.keptForLaterCount} kept for later. They'll stay unread in your inbox."
                    },
                    modifier = Modifier.fillMaxSize(),
                )
                currentConversation != null -> CatchUpConversationCard(
                    conversation = currentConversation,
                    messages = state.messages,
                    currentUserEmail = currentUserEmail,
                    isLoading = state.isLoadingMessages,
                    dragOffsetPx = cardOffsetPx,
                    isEnabled = !state.isFlushing && !isCardAnimating,
                    onDrag = { dragAmount -> cardOffsetPx += dragAmount },
                    onDragCancelled = { animateCardTo(0f) },
                    onDragEnded = {
                        catchUpSwipeAction(cardOffsetPx, swipeThresholdPx)?.let(::animateCardAction)
                            ?: animateCardTo(0f)
                    },
                    onOpenConversation = ::openCurrentConversation,
                    onOpenContentFragment = onOpenContentFragment,
                    onOpenFile = onOpenFile,
                    onOpenCitation = onOpenCitation,
                )
            }
        }

        CatchUpFeedback(
            state = state,
            onRetryMessages = catchUpViewModel::loadCurrentMessages,
            onRetrySave = { catchUpViewModel.dismiss(onDismiss) },
            onLeaveWithoutSaving = { onDismiss(emptySet()) },
        )
        if (state.isDone) {
            DustButton(
                label = if (state.isFlushing) "Saving…" else "Done",
                loading = state.isFlushing,
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                onClick = { catchUpViewModel.dismiss(onDismiss) },
            )
        }

        if (!state.isDone) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                DustButton(
                    label = "Keep for later",
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    enabled = !state.isFlushing && !isCardAnimating,
                    onClick = { animateCardAction(CatchUpSwipeAction.KEEP_FOR_LATER) },
                    variant = DustButtonVariant.Secondary,
                    iconRes = R.drawable.ic_clock_24,
                )
                DustButton(
                    label = if (currentConversation?.actionRequired == true) {
                        "Respond"
                    } else {
                        "Mark as read"
                    },
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    enabled = !state.isFlushing && !isCardAnimating,
                    onClick = {
                        animateCardAction(CatchUpSwipeAction.MARK_AS_READ)
                    },
                    iconRes = if (currentConversation?.actionRequired == true) {
                        R.drawable.ic_chevron_right_24
                    } else {
                        R.drawable.ic_check_24
                    },
                )
            }
        }
    }
}

internal const val CATCH_UP_CARD_RETURN_MS = 190
internal const val CATCH_UP_CARD_EXIT_MS = 160
internal const val CATCH_UP_EXIT_DISTANCE_DP = 420
internal const val CATCH_UP_SWIPE_HINT_DP = 30
internal const val CATCH_UP_SWIPE_THRESHOLD_DP = 80
