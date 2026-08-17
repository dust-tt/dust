package com.dust.mobile.android.ui.inbox.pod

import com.dust.mobile.android.data.AppGraph
import com.dust.mobile.android.ui.preview.localPreviewPodTasks
import com.dust.mobile.core.auth.TokenProvider
import com.dust.mobile.core.model.PodTask
import com.dust.mobile.core.model.PodTaskAssignee
import com.dust.mobile.core.model.PodTaskFilter
import com.dust.mobile.core.model.PodTaskStatus
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class PodTaskController(
    private val graph: AppGraph,
    private val tokenProvider: TokenProvider,
    private val isLocalPreview: Boolean,
    private val workspaceId: String,
    private val podId: String,
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<PodState>,
) {
    fun setFilter(filter: PodTaskFilter) {
        if (state.value.taskFilter == filter) return
        state.update { it.copy(taskFilter = filter) }
        load()
    }

    fun load() {
        val filter = state.value.taskFilter
        if (isLocalPreview) {
            state.update {
                it.copy(tasks = localPreviewPodTasks(filter), hasLoadedTasks = true, isTasksLoading = false)
            }
            return
        }
        scope.launch {
            state.update { it.copy(isTasksLoading = true, tasksError = null) }
            runCatching { graph.podRepository.fetchTasks(workspaceId, podId, filter, tokenProvider) }
                .onSuccess { tasks ->
                    state.update { it.copy(tasks = tasks, hasLoadedTasks = true, isTasksLoading = false) }
                }
                .onFailure { error ->
                    state.update {
                        it.copy(
                            hasLoadedTasks = true,
                            isTasksLoading = false,
                            tasksError = error.message ?: "Failed to load tasks",
                        )
                    }
                }
        }
    }

    fun create() {
        val trimmed = state.value.taskDraft.trim()
        if (trimmed.isEmpty() || state.value.isTaskSaving) return
        scope.launch {
            state.update { it.copy(isTaskSaving = true, actionError = null) }
            runCatching {
                if (isLocalPreview) {
                    val member = state.value.details?.members?.firstOrNull()
                    PodTask(
                        sId = "local-task-${UUID.randomUUID()}",
                        user = member?.let { PodTaskAssignee(it.sId, it.fullName, it.image) },
                        text = trimmed,
                        status = PodTaskStatus.TODO,
                    )
                } else {
                    graph.podRepository.createTask(workspaceId, podId, trimmed, tokenProvider)
                }
            }.onSuccess { task ->
                state.update {
                    it.copy(isTaskSaving = false, taskDraft = "", tasks = listOf(task) + it.tasks)
                }
            }.onFailure { error ->
                state.update {
                    it.copy(isTaskSaving = false, actionError = error.message ?: "Failed to add task")
                }
            }
        }
    }

    fun toggle(task: PodTask) {
        val newStatus = if (task.status == PodTaskStatus.DONE) PodTaskStatus.TODO else PodTaskStatus.DONE
        val previousTasks = state.value.tasks
        val filter = state.value.taskFilter
        state.update { currentState ->
            currentState.copy(
                tasks = currentState.tasks.mapNotNull { current ->
                    when {
                        current.sId != task.sId -> current
                        filter == PodTaskFilter.OPEN && newStatus == PodTaskStatus.DONE -> null
                        filter == PodTaskFilter.DONE && newStatus != PodTaskStatus.DONE -> null
                        else -> current.copy(status = newStatus)
                    }
                },
                actionError = null,
            )
        }
        if (isLocalPreview) return
        scope.launch {
            runCatching {
                graph.podRepository.updateTaskStatus(workspaceId, podId, task.sId, newStatus, tokenProvider)
            }.onFailure { error ->
                state.update {
                    it.copy(tasks = previousTasks, actionError = error.message ?: "Failed to update task")
                }
            }
        }
    }
}
