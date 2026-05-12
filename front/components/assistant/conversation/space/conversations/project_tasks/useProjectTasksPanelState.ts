import type {
  ProjectTasksPanelData,
  UseProjectTasksPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";
import { useAgentNameById } from "@app/components/assistant/conversation/space/conversations/project_tasks/TaskSubComponents";
import {
  DELETE_TASK_CONFIRM_PREVIEW_MAX_CHARS,
  isOnboardingTask,
  normalizeProjectTaskSearchNeedle,
  projectTaskMatchesLocalSearch,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { ConfirmContext } from "@app/components/Confirm";
import {
  useSpaceConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useTaskDiffAnimations } from "@app/hooks/useTaskDiffAnimations";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { compareProjectTaskAssignees } from "@app/lib/project_task/display_order";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useBulkUpdateProjectTaskStatus,
  useCreateProjectTask,
  useDeleteProjectTask,
  useMarkProjectTasksRead,
  useProjectTasks,
  useStartProjectTaskConversation,
  useUpdateProjectTask,
} from "@app/lib/swr/projects";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import type { BulkActionsBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/bulk-actions";
import type { GetProjectTasksResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/project_tasks/index";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import {
  PROJECT_TASK_UNASSIGNED_GROUP_KEY,
  type ProjectTaskAssigneeType,
  type ProjectTaskStatus,
  type ProjectTaskType,
} from "@app/types/project_task";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export function useProjectTasksPanelState({
  owner,
  spaceId,
  isReadOnly,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: UseProjectTasksPanelArgs): ProjectTasksPanelData {
  const [debouncedTaskSearchQuery, setDebouncedTaskSearchQuery] = useState("");
  const {
    tasks,
    viewerUserId,
    lastReadAt,
    isTasksLoading,
    isTasksError,
    mutateTasks,
  } = useProjectTasks({
    owner,
    spaceId,
    taskOwnerFilter,
  });
  const agentNameById = useAgentNameById(owner);
  const doUpdate = useUpdateProjectTask({ owner, spaceId });
  const doBulkUpdateStatus = useBulkUpdateProjectTaskStatus({ owner, spaceId });
  const doDelete = useDeleteProjectTask({ owner, spaceId });
  const doStartConversation = useStartProjectTaskConversation({
    owner,
    spaceId,
  });
  const markRead = useMarkProjectTasksRead({ owner, spaceId });
  const doCreateTask = useCreateProjectTask({ owner, spaceId });
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
  });
  const confirm = useContext(ConfirmContext);
  const router = useAppRouter();

  const { mutateConversations: mutateSpaceConversations } =
    useSpaceConversations({
      workspaceId: owner.sId,
      spaceId,
      options: { disabled: true },
    });
  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const [startingTaskIds, setStartingTaskIds] = useState<Set<string>>(
    new Set()
  );
  const { agentConfigurations, isLoading: isAgentsLoading } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
      disabled: isTasksLoading,
    });
  const activeAgents = useMemo(() => {
    const agents = agentConfigurations.filter((a) => a.status === "active");
    agents.sort(compareAgentsForSort);
    return agents;
  }, [agentConfigurations]);

  const projectMembers = useMemo(() => {
    const members = spaceInfo?.members ?? [];
    return [...members].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" })
    );
  }, [spaceInfo?.members]);

  const membersWithActiveTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      if (task.status !== "done" && task.user?.sId) {
        ids.add(task.user.sId);
      }
    }
    return ids;
  }, [tasks]);

  const defaultNewAssigneeId = useMemo(() => {
    if (projectMembers.length === 0) {
      return null;
    }
    if (viewerUserId && projectMembers.some((m) => m.sId === viewerUserId)) {
      return viewerUserId;
    }
    return projectMembers[0]!.sId;
  }, [projectMembers, viewerUserId]);

  // ── Diff animation state ────────────────────────────────────────────────────

  // Frozen snapshot of lastReadAt taken on first successful load. undefined =
  // not yet captured; null = first-ever visit; string = ISO timestamp.
  // Initialized synchronously so new items start hidden from the very first
  // render with data — prevents a layout shift on unchanged items caused by
  // transitioning new items from visible→hidden after the first paint.
  const [frozenLastReadAt, setFrozenLastReadAt] = useState<
    string | null | undefined
  >(() => (!isTasksLoading ? lastReadAt : undefined));

  useEffect(() => {
    if (!isTasksLoading && frozenLastReadAt === undefined) {
      setFrozenLastReadAt(lastReadAt);
    }
  }, [isTasksLoading, frozenLastReadAt, lastReadAt]);

  const { newItemKeys, doneFlashKeys } = useTaskDiffAnimations({
    ledgerScopeKey: `${owner.sId}:${spaceId}:${taskOwnerFilter.periodScope}:${taskOwnerFilter.peopleScope}`,
    tasks,
    frozenLastReadAt,
    isTasksLoading,
    markRead,
  });

  const assigneeScopedTasks = tasks;

  const normalizedTaskSearchNeedle = useMemo(
    () => normalizeProjectTaskSearchNeedle(debouncedTaskSearchQuery),
    [debouncedTaskSearchQuery]
  );

  const filteredTasks = useMemo(() => {
    if (normalizedTaskSearchNeedle === "") {
      return assigneeScopedTasks;
    }
    return assigneeScopedTasks.filter((task) =>
      projectTaskMatchesLocalSearch(task, normalizedTaskSearchNeedle)
    );
  }, [assigneeScopedTasks, normalizedTaskSearchNeedle]);

  const getFirstOnboardingTaskId = (
    tasks: ProjectTaskType[]
  ): string | null => {
    for (const task of tasks) {
      if (isOnboardingTask(task) && task.status !== "done") {
        return task.sId;
      }
    }
    return null;
  };
  const firstOnboardingTaskId = getFirstOnboardingTaskId(filteredTasks);

  const combinedGroupedTasksByUser = useMemo(() => {
    const groups = new Map<
      string,
      {
        user: ProjectTaskAssigneeType | null;
        suggestedTasks: ProjectTaskType[];
        regularTasks: ProjectTaskType[];
      }
    >();

    for (const task of filteredTasks) {
      const user = task.user ?? null;
      const key = user?.sId ?? PROJECT_TASK_UNASSIGNED_GROUP_KEY;
      let group = groups.get(key);
      if (!group) {
        group = { user, suggestedTasks: [], regularTasks: [] };
        groups.set(key, group);
      }
      if (task.agentSuggestionStatus === "pending") {
        group.suggestedTasks.push(task);
      } else {
        group.regularTasks.push(task);
      }
    }

    return [...groups.values()].sort((a, b) =>
      compareProjectTaskAssignees(a.user, b.user, viewerUserId)
    );
  }, [filteredTasks, viewerUserId]);

  const isSoleProjectMember = projectMembers.length === 1;

  const hideAssigneeHeaders = useMemo(() => {
    if (!isSoleProjectMember || viewerUserId === null) {
      return false;
    }
    if (filteredTasks.length === 0) {
      return false;
    }
    return filteredTasks.every((t) => t.user?.sId === viewerUserId);
  }, [filteredTasks, isSoleProjectMember, viewerUserId]);

  // Optimistically update a task's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (task: ProjectTaskType, status: ProjectTaskStatus) => {
      const optimistic = (prev: GetProjectTasksResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        tasks: (prev?.tasks ?? []).map((t) =>
          t.sId === task.sId ? { ...t, status } : t
        ),
      });

      void mutateTasks(optimistic, { revalidate: false });

      const result = await doUpdate(task.sId, { status });
      if (result.isErr()) {
        void mutateTasks();
      }
    },
    [doUpdate, mutateTasks, viewerUserId]
  );

  const handleToggleDone = useCallback(
    (task: ProjectTaskType) => {
      if (task.status === "done") {
        void handleSetStatus(task, "todo");
      } else {
        void handleSetStatus(task, "done");
      }
    },
    [handleSetStatus]
  );

  const onApproveAgentSuggestion = useCallback(
    async (task: ProjectTaskType) => {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_agent_suggestion",
            taskIds: [task.sId],
          }),
        }
      );
      await mutateTasks();
    },
    [owner.sId, spaceId, mutateTasks]
  );

  const onApproveAllSuggestedForAssignee = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) {
        return;
      }

      const body: BulkActionsBody = {
        action: "approve_agent_suggestion",
        taskIds,
      };
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      await mutateTasks();
    },
    [owner.sId, spaceId, mutateTasks]
  );

  const onRejectAllSuggestedForAssignee = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) {
        return;
      }
      const body: BulkActionsBody = {
        action: "reject_agent_suggestion",
        taskIds,
      };
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${spaceId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      await mutateTasks();
    },
    [owner.sId, spaceId, mutateTasks]
  );

  const patchTaskItem = useCallback(
    async (
      taskId: string,
      updates: { text?: string; assigneeUserId?: string | null }
    ) => {
      const result = await doUpdate(taskId, updates);
      if (result.isErr()) {
        throw result.error;
      }
      const updated = result.value;
      void mutateTasks(
        (prev: GetProjectTasksResponseBody | undefined) => ({
          lastReadAt: prev?.lastReadAt ?? null,
          viewerUserId: prev?.viewerUserId ?? viewerUserId,
          tasks: (prev?.tasks ?? []).map((t) =>
            t.sId === taskId
              ? {
                  ...updated,
                  sources: t.sources,
                  conversationSidebarStatus:
                    t.conversationSidebarStatus ??
                    updated.conversationSidebarStatus,
                }
              : t
          ),
        }),
        { revalidate: false }
      );
    },
    [doUpdate, mutateTasks, viewerUserId]
  );

  // Bulk set the status of every task in a category in a single request.
  // Optimistically updates the SWR cache, then revalidates on failure.
  const _handleSetStatusForSection = useCallback(
    async (status: ProjectTaskStatus) => {
      const targetIds = tasks
        .filter((t) => t.status !== status)
        .map((t) => t.sId);

      if (targetIds.length === 0) {
        return;
      }

      const targetIdSet = new Set(targetIds);
      const optimistic = (prev: GetProjectTasksResponseBody | undefined) => ({
        lastReadAt: prev?.lastReadAt ?? null,
        viewerUserId: prev?.viewerUserId ?? viewerUserId,
        tasks: (prev?.tasks ?? []).map((t) =>
          targetIdSet.has(t.sId) ? { ...t, status } : t
        ),
      });

      void mutateTasks(optimistic, { revalidate: false });

      const result = await doBulkUpdateStatus(targetIds, status);
      if (result.isErr()) {
        void mutateTasks();
      }
    },
    [doBulkUpdateStatus, mutateTasks, tasks, viewerUserId]
  );

  const handleDelete = useCallback(
    async (task: ProjectTaskType) => {
      const result = await doDelete(task.sId);
      if (result.isOk()) {
        void mutateTasks();
      }
    },
    [doDelete, mutateTasks]
  );

  const requestDelete = useCallback(
    async (task: ProjectTaskType) => {
      const preview =
        task.text.length > DELETE_TASK_CONFIRM_PREVIEW_MAX_CHARS
          ? `${task.text.slice(0, DELETE_TASK_CONFIRM_PREVIEW_MAX_CHARS)}…`
          : task.text;
      const confirmed = await confirm({
        title: "Delete task?",
        message: `"${preview}"`,
        validateLabel: "Delete",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
      void handleDelete(task);
    },
    [confirm, handleDelete]
  );

  const handleAddTask = useCallback(
    async (text: string, assigneeSId: string | null): Promise<boolean> => {
      const result = await doCreateTask({
        text,
        assigneeUserId: assigneeSId,
      });
      if (!result.isOk()) {
        return false;
      }
      const created: ProjectTaskType = {
        ...result.value,
        conversationId: null,
        conversationSidebarStatus: null,
      };
      await mutateTasks(
        (prev: GetProjectTasksResponseBody | undefined) => ({
          lastReadAt: prev?.lastReadAt ?? null,
          viewerUserId: prev?.viewerUserId ?? null,
          tasks: [created, ...(prev?.tasks ?? [])],
        }),
        { revalidate: true }
      );
      return true;
    },
    [doCreateTask, mutateTasks]
  );

  const handleStartWorking = useCallback(
    async (
      task: ProjectTaskType,
      options?: {
        customMessage?: string;
        agentConfigurationId?: string;
        goToConversation?: boolean;
      }
    ) => {
      setStartingTaskIds((prev) => new Set([...prev, task.sId]));
      const result = await doStartConversation(task.sId, {
        customMessage: options?.customMessage,
        agentConfigurationId: options?.agentConfigurationId,
      });
      if (result.isOk()) {
        const { conversationId } = result.value;
        if (options?.goToConversation && conversationId) {
          void router.push(
            getConversationRoute(owner.sId, conversationId),
            undefined,
            { shallow: true }
          );
        }
        // Reflect the new task state (conversationId set) immediately.
        // Only patch conversationId — the server-side toJSON doesn't rehydrate
        // sources, so replacing the whole task would transiently drop them.
        void mutateTasks(
          (prev: GetProjectTasksResponseBody | undefined) => ({
            lastReadAt: prev?.lastReadAt ?? null,
            viewerUserId: prev?.viewerUserId ?? viewerUserId,
            tasks: (prev?.tasks ?? []).map((t) =>
              t.sId === task.sId
                ? {
                    ...t,
                    status: "in_progress",
                    doneAt: null,
                    markedAsDoneByType: null,
                    markedAsDoneByAgentConfigurationId: null,
                    conversationId,
                    conversationSidebarStatus: "idle",
                    conversationIsRunningAgentLoop: true,
                  }
                : t
            ),
          }),
          { revalidate: false }
        );
        void mutateSpaceConversations();
        void mutateSpaceSummary();
        void mutateTasks();
      }
      setStartingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.sId);
        return next;
      });
    },
    [
      doStartConversation,
      mutateTasks,
      mutateSpaceConversations,
      mutateSpaceSummary,
      owner.sId,
      router,
      viewerUserId,
    ]
  );

  return {
    activeAgents,
    agentNameById,
    assigneeScopedTasks,
    combinedGroupedTasksByUser,
    debouncedTaskSearchQuery,
    defaultNewAssigneeId,
    doneFlashKeys,
    filteredTasks,
    firstOnboardingTaskId,
    frozenLastReadAt,
    handleAddTask,
    handleStartWorking,
    handleToggleDone,
    hideAssigneeHeaders,
    isAgentsLoading,
    isReadOnly,
    isSoleProjectMember,
    isSpaceInfoLoading,
    isTasksError,
    isTasksLoading,
    membersWithActiveTaskIds,
    newItemKeys,
    onApproveAgentSuggestion,
    onApproveAllSuggestedForAssignee,
    onRejectAllSuggestedForAssignee,
    onTaskOwnerFilterChange,
    owner,
    patchTaskItem,
    projectMembers,
    requestDelete,
    setDebouncedTaskSearchQuery,
    startingTaskIds,
    taskOwnerFilter,
    tasks,
    viewerUserId,
  };
}
