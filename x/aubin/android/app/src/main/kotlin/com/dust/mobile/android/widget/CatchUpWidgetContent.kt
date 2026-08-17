package com.dust.mobile.android.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.background
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.dust.mobile.android.MainActivity
import com.dust.mobile.android.R
import com.dust.mobile.android.data.persistence.PersistedWidgetItem

@Composable
internal fun CatchUpWidgetContent(context: Context, state: CatchUpWidgetRenderState) {
    val openApp = actionStartActivity(appIntent(context, "dust://catch-up"))
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(surface)
            .cornerRadius(20.dp)
            .clickable(openApp)
            .padding(14.dp),
    ) {
        when {
            !state.isAuthenticated -> LoggedOutWidget()
            state.snapshot == null -> UnconfiguredWidget(context, state.appWidgetId)
            else -> CatchUpWidgetBody(context, state.snapshot)
        }
    }
}

@Composable
private fun CatchUpWidgetBody(
    context: Context,
    snapshot: com.dust.mobile.android.data.persistence.PersistedWidgetSnapshot,
) {
    val size = LocalSize.current
    val itemLimit = when {
        size.width >= 300.dp && size.height >= 220.dp -> 3
        size.width >= 240.dp && size.height >= 150.dp -> 1
        else -> 0
    }
    Column(modifier = GlanceModifier.fillMaxSize()) {
        WidgetHeader(
            workspaceName = snapshot.workspaceName ?: "Catch Up",
            onRefresh = actionRunCallback<RefreshCatchUpWidgetAction>(),
            onCompose = actionStartActivity(appIntent(context, "dust://compose")),
        )
        Spacer(GlanceModifier.height(10.dp))
        MetricRow(
            actions = snapshot.actionRequiredCount,
            mentions = snapshot.mentionCount,
            unread = snapshot.unreadCount,
        )
        if (itemLimit > 0) {
            Spacer(GlanceModifier.height(8.dp))
            snapshot.items.take(itemLimit).forEachIndexed { index, item ->
                if (index > 0) Spacer(GlanceModifier.height(2.dp))
                PendingItemRow(
                    item = item,
                    onClick = actionStartActivity(
                        appIntent(
                            context,
                            "dust://conversation/${snapshot.workspaceId}/${item.conversationId}",
                        ),
                    ),
                )
            }
            if (snapshot.items.isEmpty()) {
                Spacer(GlanceModifier.height(8.dp))
                Text(
                    text = "Nothing needs your attention",
                    style = TextStyle(color = secondary, fontSize = 12.sp),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun WidgetHeader(workspaceName: String, onRefresh: Action, onCompose: Action) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            provider = ImageProvider(R.drawable.dust_logo_square),
            contentDescription = "Dust",
            modifier = GlanceModifier.size(24.dp),
        )
        Spacer(GlanceModifier.width(8.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = "Catch Up",
                style = TextStyle(color = foreground, fontSize = 14.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
            )
            Text(
                text = workspaceName,
                style = TextStyle(color = secondary, fontSize = 10.sp),
                maxLines = 1,
            )
        }
        WidgetIconButton(R.drawable.ic_refresh_24, "Refresh", onRefresh)
        Spacer(GlanceModifier.width(2.dp))
        WidgetIconButton(R.drawable.ic_chat_plus_24, "New conversation", onCompose)
    }
}

@Composable
private fun WidgetIconButton(iconRes: Int, label: String, action: Action) {
    Box(
        modifier = GlanceModifier
            .size(32.dp)
            .clickable(action),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            provider = ImageProvider(iconRes),
            contentDescription = label,
            modifier = GlanceModifier.size(18.dp),
            colorFilter = ColorFilter.tint(foreground),
        )
    }
}

@Composable
private fun MetricRow(actions: Int, mentions: Int, unread: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        Metric("Actions", actions, actionColor, GlanceModifier.defaultWeight())
        Metric("Mentions", mentions, mentionColor, GlanceModifier.defaultWeight())
        Metric("Unread", unread, unreadColor, GlanceModifier.defaultWeight())
    }
}

@Composable
private fun Metric(label: String, count: Int, color: ColorProvider, modifier: GlanceModifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = compactCount(count),
            style = TextStyle(color = color, fontSize = 18.sp, fontWeight = FontWeight.Bold),
            maxLines = 1,
        )
        Text(
            text = label,
            style = TextStyle(color = secondary, fontSize = 10.sp),
            maxLines = 1,
        )
    }
}

@Composable
private fun PendingItemRow(item: PersistedWidgetItem, onClick: Action) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(34.dp)
            .clickable(onClick)
            .padding(horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(7.dp)
                .background(item.statusColor)
                .cornerRadius(2.dp),
        ) {}
        Spacer(GlanceModifier.width(8.dp))
        Text(
            text = item.title,
            modifier = GlanceModifier.defaultWeight(),
            style = TextStyle(color = foreground, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
        )
        Spacer(GlanceModifier.width(4.dp))
        Image(
            provider = ImageProvider(R.drawable.ic_chevron_right_24),
            contentDescription = null,
            modifier = GlanceModifier.size(14.dp),
            colorFilter = ColorFilter.tint(secondary),
        )
    }
}

@Composable
private fun LoggedOutWidget() {
    Column(
        modifier = GlanceModifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            provider = ImageProvider(R.drawable.dust_logo_square),
            contentDescription = "Dust",
            modifier = GlanceModifier.size(28.dp),
        )
        Spacer(GlanceModifier.height(8.dp))
        Text(
            text = "Sign in to view Catch Up",
            style = TextStyle(color = foreground, fontSize = 13.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
        )
    }
}

@Composable
private fun UnconfiguredWidget(context: Context, appWidgetId: Int?) {
    val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
        .setClass(context, CatchUpWidgetConfigurationActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId ?: AppWidgetManager.INVALID_APPWIDGET_ID)
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .clickable(actionStartActivity(intent)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_tune_24),
            contentDescription = null,
            modifier = GlanceModifier.size(24.dp),
            colorFilter = ColorFilter.tint(foreground),
        )
        Spacer(GlanceModifier.height(8.dp))
        Text(
            text = "Choose a workspace",
            style = TextStyle(color = foreground, fontSize = 13.sp, fontWeight = FontWeight.Medium),
            maxLines = 1,
        )
    }
}

internal class RefreshCatchUpWidgetAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: androidx.glance.GlanceId,
        parameters: androidx.glance.action.ActionParameters,
    ) {
        (context.applicationContext as com.dust.mobile.android.DustApplication)
            .graph.catchUpWidgetController.requestRefresh()
    }
}

private fun appIntent(context: Context, deepLink: String): Intent =
    Intent(Intent.ACTION_VIEW, deepLink.toUri(), context, MainActivity::class.java)

private fun compactCount(count: Int): String = if (count > 99) "99+" else count.toString()

private val PersistedWidgetItem.statusColor: ColorProvider
    get() = when {
        actionRequired -> actionColor
        mentioned -> mentionColor
        else -> unreadColor
    }

private val surface = ColorProvider(Color(0xFFF8F8F4))
private val foreground = ColorProvider(Color(0xFF171717))
private val secondary = ColorProvider(Color(0xFF686B67))
private val actionColor = ColorProvider(Color(0xFFC65E42))
private val mentionColor = ColorProvider(Color(0xFF326B84))
private val unreadColor = ColorProvider(Color(0xFF418B5C))
