import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { PodTaskAssigneeType, PodTaskType } from "@app/types/project_task";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";

export type GroupedTasksByAssignee = Array<{
  user: PodTaskAssigneeType | null;
  tasks: PodTaskType[];
}>;

export type CombinedGroupedTasksByUser = Array<{
  user: PodTaskAssigneeType | null;
  suggestedTasks: PodTaskType[];
  regularTasks: PodTaskType[];
}>;

export type PodTasksPanelData = {
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
  viewerUserId: string | null;
  isReadOnly?: boolean;
  owner: LightWorkspaceType;
  combinedGroupedTasksByUser: CombinedGroupedTasksByUser;
  activeAgents: LightAgentConfigurationType[];
  isAgentsLoading: boolean;
  agentNameById: Map<string, string>;
  newItemKeys: Set<string>;
  doneFlashKeys: Set<string>;
  startingTaskIds: Set<string>;
  firstOnboardingTaskId: string | null;
  podMembers: SpaceUserType[];
  membersWithActiveTaskIds: Set<string>;
  handleToggleDone: (task: PodTaskType) => void;
  requestDelete: (task: PodTaskType) => Promise<void>;
  onApproveAgentSuggestion: (task: PodTaskType) => Promise<void>;
  onApproveAllSuggestedForAssignee: (taskIds: string[]) => Promise<void>;
  onRejectAllSuggestedForAssignee: (taskIds: string[]) => Promise<void>;
  handleStartWorking: (
    task: PodTaskType,
    options?: {
      customMessage?: string;
      agentConfigurationId?: string;
      goToConversation?: boolean;
    }
  ) => Promise<void>;
  patchTaskItem: (
    taskId: string,
    updates: { text?: string; assigneeUserId?: string | null }
  ) => Promise<void>;
  isPodInfoLoading: boolean;
  defaultNewAssigneeId: string | null;
  handleAddTask: (text: string, assigneeSId: string | null) => Promise<boolean>;
  isTasksLoading: boolean;
  isTasksError: boolean;
  frozenLastReadAt: string | null | undefined;
  tasks: PodTaskType[];
  /** List returned for the current period & people filters (includes server-side filtering). */
  assigneeScopedTasks: PodTaskType[];
  /** After debounced description search (`debouncedTodoSearchQuery`). */
  filteredTasks: PodTaskType[];
  /** Debounced query from ProjectTodoLocalSearch; tables filter on this. */
  debouncedTaskSearchQuery: string;
  setDebouncedTaskSearchQuery: (value: string) => void;
  /** Single project member — hide member lists, reassign, and add-row assignee picker. */
  isSolePodMember: boolean;
  /** Solo project + every visible task is assigned to the viewer — flat list, no assignee headers. */
  hideAssigneeHeaders: boolean;
};

export type UsePodTasksPanelArgs = {
  owner: LightWorkspaceType;
  podId: string;
  isReadOnly?: boolean;
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
};
