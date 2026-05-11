import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ProjectTaskAssigneeType,
  ProjectTaskType,
} from "@app/types/project_task";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";

export type GroupedTasksByAssignee = Array<{
  user: ProjectTaskAssigneeType | null;
  tasks: ProjectTaskType[];
}>;

export type CombinedGroupedTasksByUser = Array<{
  user: ProjectTaskAssigneeType | null;
  suggestedTasks: ProjectTaskType[];
  regularTasks: ProjectTaskType[];
}>;

export type ProjectTasksPanelData = {
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
  projectMembers: SpaceUserType[];
  membersWithActiveTaskIds: Set<string>;
  handleToggleDone: (task: ProjectTaskType) => void;
  requestDelete: (task: ProjectTaskType) => Promise<void>;
  onApproveAgentSuggestion: (task: ProjectTaskType) => Promise<void>;
  onApproveAllSuggestedForAssignee: (taskIds: string[]) => Promise<void>;
  onRejectAllSuggestedForAssignee: (taskIds: string[]) => Promise<void>;
  handleStartWorking: (
    task: ProjectTaskType,
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
  isSpaceInfoLoading: boolean;
  defaultNewAssigneeId: string | null;
  handleAddTask: (text: string, assigneeSId: string | null) => Promise<boolean>;
  isTasksLoading: boolean;
  isTasksError: boolean;
  frozenLastReadAt: string | null | undefined;
  tasks: ProjectTaskType[];
  /** List returned for the current period & people filters (includes server-side filtering). */
  assigneeScopedTasks: ProjectTaskType[];
  /** After debounced description search (`debouncedTodoSearchQuery`). */
  filteredTasks: ProjectTaskType[];
  /** Debounced query from ProjectTodoLocalSearch; tables filter on this. */
  debouncedTaskSearchQuery: string;
  setDebouncedTaskSearchQuery: (value: string) => void;
  /** Single project member — hide member lists, reassign, and add-row assignee picker. */
  isSoleProjectMember: boolean;
  /** Solo project + every visible task is assigned to the viewer — flat list, no assignee headers. */
  hideAssigneeHeaders: boolean;
};

export type UseProjectTasksPanelArgs = {
  owner: LightWorkspaceType;
  spaceId: string;
  isReadOnly?: boolean;
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
};
