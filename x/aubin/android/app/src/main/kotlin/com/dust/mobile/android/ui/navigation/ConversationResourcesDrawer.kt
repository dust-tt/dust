package com.dust.mobile.android.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.conversation.files.ConversationFilesPanel
import com.dust.mobile.core.auth.TokenProvider
import kotlinx.coroutines.launch
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationResourcesDrawer(
    destination: Destination.ConversationDetail?,
    graph: AppGraph,
    tokenProvider: TokenProvider,
    isLocalPreview: Boolean,
    workspaceId: String,
    navigateTo: (Destination) -> Unit,
    content: @Composable (openDrawer: () -> Unit) -> Unit,
) {
    if (destination == null) {
        content {}
        return
    }

    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val closeDrawer: () -> Unit = { scope.launch { drawerState.close() } }
    val openDrawer: () -> Unit = { scope.launch { drawerState.open() } }

    LaunchedEffect(drawerState.currentValue) {
        if (drawerState.currentValue == DrawerValue.Open) {
            focusManager.clearFocus(force = true)
            keyboardController?.hide()
        }
    }
    BackHandler(enabled = drawerState.isOpen, onBack = closeDrawer)

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = drawerState.isOpen,
            drawerContent = {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    ModalDrawerSheet(
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                            .widthIn(max = 400.dp),
                    ) {
                        ConversationFilesPanel(
                            graph = graph,
                            tokenProvider = tokenProvider,
                            isLocalPreview = isLocalPreview,
                            workspaceId = workspaceId,
                            conversation = destination.conversation,
                            onClose = closeDrawer,
                            onOpenAttachment = { attachment ->
                                attachment.fileId?.let { fileId ->
                                    scope.launch {
                                        drawerState.close()
                                        navigateTo(
                                            Destination.AttachmentViewer(
                                                title = attachment.title,
                                                contentType = attachment.contentType,
                                                fileId = fileId,
                                                sourceUrl = attachment.sourceUrl,
                                                returnTo = destination,
                                            ),
                                        )
                                    }
                                }
                            },
                        )
                    }
                }
            },
        ) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                ConversationResourcesGestureLayer(onOpen = openDrawer) {
                    content(openDrawer)
                }
            }
        }
    }
}

@Composable
private fun ConversationResourcesGestureLayer(
    onOpen: () -> Unit,
    content: @Composable () -> Unit,
) {
    val currentOnOpen = rememberUpdatedState(onOpen)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                val outerSystemGestureZonePx = 24.dp.toPx()
                val activationZonePx = 72.dp.toPx()
                val openThresholdPx = 48.dp.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val distanceFromRight = size.width - down.position.x
                    if (distanceFromRight !in outerSystemGestureZonePx..activationZonePx) {
                        return@awaitEachGesture
                    }

                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        val drag = change.position - down.position
                        if (drag.x <= -openThresholdPx && abs(drag.x) > abs(drag.y) * 1.25f) {
                            change.consume()
                            currentOnOpen.value()
                            break
                        }
                        if (abs(drag.y) > openThresholdPx || drag.x > openThresholdPx / 2f) break
                    }
                }
            },
    ) {
        content()
    }
}
