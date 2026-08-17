package com.dust.mobile.android.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.dust.mobile.android.DustApplication
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.DustButton
import com.dust.mobile.android.ui.common.DustButtonVariant
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.LoadingScreen
import com.dust.mobile.android.ui.theme.DustTheme
import com.dust.mobile.core.model.Workspace
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CatchUpWidgetConfigurationActivity : ComponentActivity() {
    private val state = MutableStateFlow(WidgetConfigurationState())
    private val graph by lazy { (application as DustApplication).graph }
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        appWidgetId = intent?.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        setResult(Activity.RESULT_CANCELED, result)
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        enableEdgeToEdge()
        setContent {
            DustTheme {
                val uiState by state.collectAsStateWithLifecycle()
                WidgetConfigurationScreen(
                    state = uiState,
                    onSelectWorkspace = { workspace ->
                        state.update { it.copy(selectedWorkspace = workspace) }
                    },
                    onSave = ::save,
                    onRetry = ::load,
                    onCancel = ::finish,
                )
            }
        }
        load()
    }

    private fun load() {
        lifecycleScope.launch {
            state.update { it.copy(isLoading = true, error = null) }
            val tokens = graph.tokenStore.loadTokens()
            if (tokens == null) {
                state.value = WidgetConfigurationState(error = "Sign in to Dust before adding this widget.")
                return@launch
            }
            val provider = graph.tokenProvider(tokens) { graph.clearPersistedSession() }
            runCatching { graph.userRepository.fetchDustUser(provider) }
                .onSuccess { user ->
                    val persisted = graph.persistedStateStore.current()
                    val selectedId = persisted.widgetWorkspaceIds[appWidgetId]
                        ?: persisted.selectedWorkspaceId
                        ?: user.selectedWorkspace
                    state.value = WidgetConfigurationState(
                        workspaces = user.workspaces,
                        selectedWorkspace = user.workspaces.find { it.sId == selectedId }
                            ?: user.workspaces.firstOrNull(),
                    )
                }
                .onFailure { error ->
                    state.value = WidgetConfigurationState(
                        error = error.message ?: "Could not load workspaces",
                    )
                }
        }
    }

    private fun save() {
        val workspace = state.value.selectedWorkspace ?: return
        lifecycleScope.launch {
            state.update { it.copy(isSaving = true, error = null) }
            runCatching {
                graph.catchUpWidgetController.configure(appWidgetId, workspace)
                val glanceId = GlanceAppWidgetManager(this@CatchUpWidgetConfigurationActivity)
                    .getGlanceIdBy(appWidgetId)
                CatchUpWidget().update(this@CatchUpWidgetConfigurationActivity, glanceId)
                graph.catchUpWidgetController.requestRefresh()
            }.onSuccess {
                val result = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                setResult(Activity.RESULT_OK, result)
                finish()
            }.onFailure { error ->
                state.update {
                    it.copy(isSaving = false, error = error.message ?: "Could not configure widget")
                }
            }
        }
    }
}

internal data class WidgetConfigurationState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val workspaces: List<Workspace> = emptyList(),
    val selectedWorkspace: Workspace? = null,
    val error: String? = null,
)

@Composable
private fun WidgetConfigurationScreen(
    state: WidgetConfigurationState,
    onSelectWorkspace: (Workspace) -> Unit,
    onSave: () -> Unit,
    onRetry: () -> Unit,
    onCancel: () -> Unit,
) {
    Scaffold { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .navigationBarsPadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                com.dust.mobile.android.ui.common.DustIconButton(
                    iconRes = R.drawable.ic_close_24,
                    contentDescription = "Cancel",
                    onClick = onCancel,
                )
                Text(
                    text = "Catch Up widget",
                    modifier = Modifier.padding(horizontal = 8.dp),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            HorizontalDivider()
            when {
                state.isLoading -> Box(Modifier.weight(1f)) { LoadingScreen() }
                state.error != null && state.workspaces.isEmpty() -> Box(Modifier.weight(1f)) {
                    ErrorScreen(message = state.error, onRetry = onRetry)
                }
                else -> WorkspaceChoices(
                    workspaces = state.workspaces,
                    selectedWorkspace = state.selectedWorkspace,
                    onSelectWorkspace = onSelectWorkspace,
                    modifier = Modifier.weight(1f),
                )
            }
            state.error?.takeIf { state.workspaces.isNotEmpty() }?.let { error ->
                Text(
                    text = error,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                DustButton(
                    label = "Save",
                    enabled = state.selectedWorkspace != null && !state.isSaving,
                    loading = state.isSaving,
                    onClick = onSave,
                    variant = DustButtonVariant.Primary,
                )
            }
        }
    }
}

@Composable
private fun WorkspaceChoices(
    workspaces: List<Workspace>,
    selectedWorkspace: Workspace?,
    onSelectWorkspace: (Workspace) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(modifier = modifier.fillMaxWidth()) {
        items(workspaces, key = Workspace::sId) { workspace ->
            val selected = workspace.sId == selectedWorkspace?.sId
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectWorkspace(workspace) }
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    painter = painterResource(
                        if (selected) R.drawable.ic_check_circle_24 else R.drawable.ic_radio_unchecked_24,
                    ),
                    contentDescription = if (selected) "Selected" else null,
                    modifier = Modifier.size(20.dp),
                    tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                )
                Spacer(Modifier.size(12.dp))
                Text(
                    text = workspace.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
            HorizontalDivider(modifier = Modifier.padding(start = 52.dp))
        }
    }
}
