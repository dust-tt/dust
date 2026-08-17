package com.dust.mobile.android.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.window.core.layout.WindowWidthSizeClass
import com.dust.mobile.android.R
import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.android.ui.theme.subtleBorder
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.Workspace

@Composable
internal fun AuthenticatedAppScaffold(
    destination: Destination,
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspace: Workspace,
    isLocalPreview: Boolean,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
    content: @Composable (Destination) -> Unit,
) {
    val adaptiveInfo = currentWindowAdaptiveInfo()
    val usesTwoPanes = destination.usesInboxListDetailLayout &&
        adaptiveInfo.windowSizeClass.windowWidthSizeClass == WindowWidthSizeClass.EXPANDED

    if (usesTwoPanes) {
        InboxListDetailLayout(
            destination = destination,
            graph = graph,
            tokenProvider = tokenProvider,
            workspace = workspace,
            isLocalPreview = isLocalPreview,
            verticalHinge = adaptiveInfo.windowPosture.hingeList.firstOrNull {
                it.isVertical && it.isSeparating
            }?.bounds,
            openUrl = openUrl,
            navigateTo = navigateTo,
            content = content,
        )
    } else {
        DestinationScaffold(
            destination = destination,
            graph = graph,
            tokenProvider = tokenProvider,
            workspace = workspace,
            isLocalPreview = isLocalPreview,
            openUrl = openUrl,
            navigateTo = navigateTo,
            content = content,
        )
    }
}

@Composable
private fun InboxListDetailLayout(
    destination: Destination,
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspace: Workspace,
    isLocalPreview: Boolean,
    verticalHinge: androidx.compose.ui.geometry.Rect?,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
    content: @Composable (Destination) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
        val density = LocalDensity.current
        val hingeStart = verticalHinge?.let { with(density) { it.left.toDp() } }
        val hingeWidth = verticalHinge?.let { with(density) { it.width.toDp() } }
        val canAlignToHinge = hingeStart != null &&
            hingeStart >= MinimumListPaneWidth &&
            maxWidth - hingeStart - (hingeWidth ?: 0.dp) >= MinimumDetailPaneWidth
        val listPaneWidth = if (canAlignToHinge) {
            hingeStart
        } else {
            (maxWidth * DefaultListPaneFraction).coerceIn(MinimumListPaneWidth, MaximumListPaneWidth)
        }

        Row(Modifier.fillMaxSize()) {
            Box(Modifier.width(listPaneWidth).fillMaxSize()) {
                content(Destination.List)
            }
            if (canAlignToHinge && hingeWidth != null && hingeWidth > 0.dp) {
                Spacer(Modifier.width(hingeWidth).fillMaxSize())
            } else {
                VerticalDivider(color = MaterialTheme.colorScheme.subtleBorder)
            }
            Box(Modifier.weight(1f).fillMaxSize()) {
                if (destination == Destination.List) {
                    EmptyDetailPane()
                } else {
                    DestinationScaffold(
                        destination = destination,
                        graph = graph,
                        tokenProvider = tokenProvider,
                        workspace = workspace,
                        isLocalPreview = isLocalPreview,
                        openUrl = openUrl,
                        navigateTo = navigateTo,
                        content = content,
                    )
                }
            }
        }
    }
}

@Composable
private fun DestinationScaffold(
    destination: Destination,
    graph: AppGraph,
    tokenProvider: TokenProvider,
    workspace: Workspace,
    isLocalPreview: Boolean,
    openUrl: (String) -> Unit,
    navigateTo: (Destination) -> Unit,
    content: @Composable (Destination) -> Unit,
) {
    ConversationResourcesDrawer(
        destination = destination as? Destination.ConversationDetail,
        graph = graph,
        tokenProvider = tokenProvider,
        isLocalPreview = isLocalPreview,
        workspaceId = workspace.sId,
        navigateTo = navigateTo,
    ) { openConversationFiles ->
        Scaffold(
            topBar = {
                AuthenticatedDestinationTopBar(
                    destination = destination,
                    graph = graph,
                    workspace = workspace,
                    isLocalPreview = isLocalPreview,
                    openUrl = openUrl,
                    navigateTo = navigateTo,
                    onOpenConversationFiles = openConversationFiles,
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize(),
            ) {
                content(destination)
            }
        }
    }
}

@Composable
private fun EmptyDetailPane() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        Icon(
            painter = painterResource(R.drawable.ic_chat_24),
            contentDescription = null,
            modifier = Modifier.size(32.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "No conversation selected",
            modifier = Modifier.padding(top = DustSpacing.small),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.weight(1f))
    }
}

private val MinimumListPaneWidth: Dp = 320.dp
private val MaximumListPaneWidth: Dp = 420.dp
private val MinimumDetailPaneWidth: Dp = 400.dp
private const val DefaultListPaneFraction = 0.4f
