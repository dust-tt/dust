import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ProjectTaskAssigneeType,
  ProjectTaskType,
} from "@app/types/project_task";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import type { Dispatch, SetStateAction } from "react";

export type GroupedTasksByAssignee = Array<{
  user: ProjectTaskAssigneeType | null;
  tasks: ProjectTaskType[];
}>;

export type ProjectTasksPanelData = {
  isScopeMenuOpen: boolean;
  setIsScopeMenuOpen: Dispatch<SetStateAction<boolean>>;
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
  viewerUserId: string | null;
  taskScopeLabel: string;
  isReadOnly?: boolean;
  showSuggestedTasksTable: boolean;
  owner: LightWorkspaceType;
  groupedSuggestedTasksOnly: GroupedTasksByAssignee;
  groupedRegularTasksOnly: GroupedTasksByAssignee;
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
  onRejectAgentSuggestion: (task: ProjectTaskType) => Promise<void>;
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
    updates: { text?: string; assigneeUserId?: string }
  ) => Promise<void>;
  isSpaceInfoLoading: boolean;
  defaultNewAssigneeSId: string | null;
  handleAddTask: (text: string, assigneeSId: string) => Promise<boolean>;
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
  /** Solo project + every visible regular task is assigned to the viewer — flat list, no assignee headers. */
  hideRegularTaskAssigneeHeaders: boolean;
};

export type UseProjectTasksPanelArgs = {
  owner: LightWorkspaceType;
  spaceId: string;
  isReadOnly?: boolean;
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
};
