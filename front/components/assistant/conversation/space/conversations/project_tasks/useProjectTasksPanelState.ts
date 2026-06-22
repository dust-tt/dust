import type {
  PodTasksPanelData,
  UsePodTasksPanelArgs,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksPanelTypes";
import {
  DELETE_TASK_CONFIRM_PREVIEW_MAX_CHARS,
  isOnboardingTask,
  normalizePodTaskSearchNeedle,
  podTaskMatchesLocalSearch,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import { ConfirmContext } from "@app/components/Confirm";
import { useAgentNameById } from "@app/components/pod/tasks/TaskSubComponents";
import {
  usePodConversations,
  usePodConversationsSummary,
} from "@app/hooks/conversations";
import { useTaskDiffAnimations } from "@app/hooks/useTaskDiffAnimations";
import type {
  BulkActionsBody,
  GetPodTasksResponseBody,
} from "@app/lib/api/projects/tasks";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { comparePodTaskAssignees } from "@app/lib/project_task/display_order";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useCreatePodTask,
  useDeletePodTask,
  useMarkPodTasksRead,
  usePodMetadata,
  usePodTasks,
  useStartPodTaskConversation,
  useUpdatePodTask,
} from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getConversationRoute } from "@app/lib/utils/router";
import { compareAgentsForSort } from "@app/types/assistant/assistant";
import {
  POD_TASK_UNASSIGNED_GROUP_KEY,
  type PodTaskAssigneeType,
  type PodTaskStatus,
  type PodTaskType,
} from "@app/types/project_task";
import { resolveDefaultAgentId } from "@app/types/user";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

export function usePodTasksPanelState({
  owner,
  podId,
  isReadOnly,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: UsePodTasksPanelArgs): PodTasksPanelData {
  const [debouncedTaskSearchQuery, setDebouncedTaskSearchQuery] = useState("");
  const {
    tasks,
    viewerUserId,
    lastReadAt,
    isTasksLoading,
    isTasksError,
    mutateTasks,
  } = usePodTasks({
    owner,
    podId: podId,
    taskOwnerFilter,
  });
  const agentNameById = useAgentNameById(owner);
  const doUpdate = useUpdatePodTask({ owner, podId: podId });
  const doDelete = useDeletePodTask({ owner, podId: podId });
  const doStartConversation = useStartPodTaskConversation({
    owner,
    podId,
  });
  const markRead = useMarkPodTasksRead({ owner, podId: podId });
  const doCreateTask = useCreatePodTask({ owner, podId: podId });
  const { spaceInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: podId,
  });
  const confirm = useContext(ConfirmContext);
  const router = useAppRouter();

  const { mutateConversations: mutateSpaceConversations } = usePodConversations(
    {
      workspaceId: owner.sId,
      podId,
      options: { disabled: true },
    }
  );
  const { mutate: mutateSpaceSummary } = usePodConversationsSummary({
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

  const { hasFeature } = useFeatureFlags();
  const { podMetadata } = usePodMetadata({
    workspaceId: owner.sId,
    podId,
  });
  const defaultAgentId = resolveDefaultAgentId({
    owner,
    podDefaultAgentId: podMetadata?.defaultAgentId,
    hasWorkspaceDefaultAgentFeature: hasFeature("workspace_default_agent"),
    hasPodDefaultAgentFeature: hasFeature("pod_default_agent"),
  });

  const podMembers = useMemo(() => {
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
    if (podMembers.length === 0) {
      return null;
    }
    if (viewerUserId && podMembers.some((m) => m.sId === viewerUserId)) {
      return viewerUserId;
    }
    return podMembers[0]!.sId;
  }, [podMembers, viewerUserId]);

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
    ledgerScopeKey: `${owner.sId}:${podId}:${taskOwnerFilter.periodScope}:${taskOwnerFilter.peopleScope}`,
    tasks,
    frozenLastReadAt,
    isTasksLoading,
    markRead,
  });

  const assigneeScopedTasks = tasks;

  const normalizedTaskSearchNeedle = useMemo(
    () => normalizePodTaskSearchNeedle(debouncedTaskSearchQuery),
    [debouncedTaskSearchQuery]
  );

  const filteredTasks = useMemo(() => {
    if (normalizedTaskSearchNeedle === "") {
      return assigneeScopedTasks;
    }
    return assigneeScopedTasks.filter((task) =>
      podTaskMatchesLocalSearch(task, normalizedTaskSearchNeedle)
    );
  }, [assigneeScopedTasks, normalizedTaskSearchNeedle]);

  // `seedInitialPodTasks` inserts INITIAL_POD_TASKS in reverse, so the largest
  // `createdAt` among the seeded onboarding rows is the first onboarding task.
  // Unlike `updatedAt`, `createdAt` never changes, so the pulse target stays
  // stable as users approve/edit/complete tasks out of order.
  const getFirstOnboardingTaskId = (tasks: PodTaskType[]): string | null => {
    let firstOnboardingTask: PodTaskType | null = null;
    for (const task of tasks) {
      if (
        !isOnboardingTask(task) ||
        task.status === "done" ||
        task.agentSuggestionStatus === "pending"
      ) {
        continue;
      }
      if (
        firstOnboardingTask === null ||
        new Date(task.createdAt).getTime() >
          new Date(firstOnboardingTask.createdAt).getTime()
      ) {
        firstOnboardingTask = task;
      }
    }
    return firstOnboardingTask?.sId ?? null;
  };
  const firstOnboardingTaskId = getFirstOnboardingTaskId(filteredTasks);

  const combinedGroupedTasksByUser = useMemo(() => {
    const groups = new Map<
      string,
      {
        user: PodTaskAssigneeType | null;
        suggestedTasks: PodTaskType[];
        regularTasks: PodTaskType[];
      }
    >();

    for (const task of filteredTasks) {
      const user = task.user ?? null;
      const key = user?.sId ?? POD_TASK_UNASSIGNED_GROUP_KEY;
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
      comparePodTaskAssignees(a.user, b.user, viewerUserId)
    );
  }, [filteredTasks, viewerUserId]);

  const isSolePodMember = podMembers.length === 1;

  const hideAssigneeHeaders = useMemo(() => {
    if (!isSolePodMember || viewerUserId === null) {
      return false;
    }
    if (filteredTasks.length === 0) {
      return false;
    }
    return filteredTasks.every((t) => t.user?.sId === viewerUserId);
  }, [filteredTasks, isSolePodMember, viewerUserId]);

  // Optimistically update a task's status in the SWR cache and send the PATCH.
  // On failure the cache is revalidated from the server.
  const handleSetStatus = useCallback(
    async (task: PodTaskType, status: PodTaskStatus) => {
      const optimistic = (prev: GetPodTasksResponseBody | undefined) => ({
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
    (task: PodTaskType) => {
      if (task.status === "done") {
        void handleSetStatus(task, "todo");
      } else {
        void handleSetStatus(task, "done");
      }
    },
    [handleSetStatus]
  );

  const onApproveAgentSuggestion = useCallback(
    async (task: PodTaskType) => {
      await clientFetch(
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/bulk-actions`,
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
    [owner.sId, podId, mutateTasks]
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
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      await mutateTasks();
    },
    [owner.sId, podId, mutateTasks]
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
        `/api/w/${owner.sId}/spaces/${podId}/project_tasks/bulk-actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      await mutateTasks();
    },
    [owner.sId, podId, mutateTasks]
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
        (prev: GetPodTasksResponseBody | undefined) => ({
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

  const handleDelete = useCallback(
    async (task: PodTaskType) => {
      const result = await doDelete(task.sId);
      if (result.isOk()) {
        void mutateTasks();
      }
    },
    [doDelete, mutateTasks]
  );

  const requestDelete = useCallback(
    async (task: PodTaskType) => {
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
      const created: PodTaskType = {
        ...result.value,
        conversationId: null,
        conversationSidebarStatus: null,
      };
      await mutateTasks(
        (prev: GetPodTasksResponseBody | undefined) => ({
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
      task: PodTaskType,
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
          (prev: GetPodTasksResponseBody | undefined) => ({
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
    defaultAgentId,
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
    isSolePodMember: isSolePodMember,
    isPodInfoLoading: isSpaceInfoLoading,
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
    podMembers: podMembers,
    requestDelete,
    setDebouncedTaskSearchQuery,
    startingTaskIds,
    taskOwnerFilter,
    tasks,
    viewerUserId,
  };
}
