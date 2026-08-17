package com.dust.mobile.android.ui.inbox.pod

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.dust.mobile.android.R
import com.dust.mobile.android.ui.common.ContentCrossfade
import com.dust.mobile.android.ui.common.DustFeedbackState
import com.dust.mobile.android.ui.common.ErrorScreen
import com.dust.mobile.android.ui.common.ConversationRowsSkeleton
import com.dust.mobile.android.ui.theme.DustSpacing
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskFilter

@Composable
internal fun PodTasksTab(
    state: PodState,
    canAddTasks: Boolean,
    onFilterChange: (PodTaskFilter) -> Unit,
    onToggleTask: (PodTask) -> Unit,
    onTaskDraftChange: (String) -> Unit,
    onCreateTask: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        PodTaskFilterControl(selected = state.taskFilter, onSelect = onFilterChange)
        Box(Modifier.weight(1f)) {
            ContentCrossfade(
                targetState = state.isTasksLoading,
                label = "pod-tasks-loading",
                modifier = Modifier.fillMaxSize(),
            ) { isLoading ->
                when {
                    isLoading -> ConversationRowsSkeleton()
                    state.tasksError != null -> ErrorScreen(state.tasksError, onRetry)
                    state.tasks.isEmpty() -> DustFeedbackState(
                        iconRes = R.drawable.ic_check_circle_24,
                        title = if (state.taskFilter == PodTaskFilter.OPEN) "No open tasks" else "No completed tasks",
                        message = if (state.taskFilter == PodTaskFilter.OPEN) {
                            "Add a task when there is something the Pod needs to track."
                        } else {
                            "Tasks completed in the last 30 days appear here."
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = DustSpacing.large),
                    ) {
                        items(state.tasks, key = { it.sId }) { task ->
                            PodTaskRow(
                                task = task,
                                onToggle = { onToggleTask(task) },
                                onOpenConversation = task.conversationId?.let { id ->
                                    { onOpenConversation(id) }
                                },
                            )
                        }
                    }
                }
            }
        }
        if (canAddTasks && state.taskFilter == PodTaskFilter.OPEN) {
            PodTaskComposer(
                text = state.taskDraft,
                isSaving = state.isTaskSaving,
                onTextChange = onTaskDraftChange,
                onSubmit = onCreateTask,
            )
        }
    }
}
