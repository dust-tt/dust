import type { ProjectTodosDataTable } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTable";
import type { TodoOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosListScope";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { LightWorkspaceType, SpaceUserType } from "@app/types/user";
import type { ComponentProps, Dispatch, SetStateAction } from "react";

export type GroupedTodosByAssignee = Array<{
  user: ProjectTodoAssigneeType | null;
  todos: ProjectTodoType[];
}>;

type ProjectTodosDataTableProps = ComponentProps<typeof ProjectTodosDataTable>;

export type ProjectTodosPanelData = {
  isScopeMenuOpen: boolean;
  setIsScopeMenuOpen: Dispatch<SetStateAction<boolean>>;
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
  viewerUserId: string | null;
  todoScopeLabel: string;
  isReadOnly?: boolean;
  hasDoneItems: boolean;
  handleClean: () => Promise<void>;
  isCleaning: boolean;
  showSuggestedTodosTable: boolean;
  owner: LightWorkspaceType;
  groupedSuggestedTodosOnly: GroupedTodosByAssignee;
  groupedRegularTodosOnly: GroupedTodosByAssignee;
  activeAgents: ProjectTodosDataTableProps["activeAgents"];
  isAgentsLoading: boolean;
  agentNameById: Map<string, string>;
  pendingRemovalIds: Set<string>;
  newItemKeys: Set<string>;
  doneFlashKeys: Set<string>;
  startingTodoIds: Set<string>;
  firstOnboardingTodoId: string | null;
  projectMembers: SpaceUserType[];
  membersWithActiveTodoIds: Set<string>;
  handleToggleDone: (todo: ProjectTodoType) => void;
  requestDelete: (todo: ProjectTodoType) => Promise<void>;
  onApproveAgentSuggestion: (todo: ProjectTodoType) => Promise<void>;
  onRejectAgentSuggestion: (todo: ProjectTodoType) => Promise<void>;
  onApproveAllSuggestedForAssignee: (todoIds: string[]) => Promise<void>;
  onRejectAllSuggestedForAssignee: (todoIds: string[]) => Promise<void>;
  handleStartWorking: (
    todo: ProjectTodoType,
    options?: {
      customMessage?: string;
      agentConfigurationId?: string;
      goToConversation?: boolean;
    }
  ) => Promise<void>;
  patchTodoItem: (
    todoId: string,
    updates: { text?: string; assigneeUserId?: string }
  ) => Promise<void>;
  isSpaceInfoLoading: boolean;
  defaultNewAssigneeSId: string | null;
  handleAddTodo: (text: string, assigneeSId: string) => Promise<boolean>;
  isTodosLoading: boolean;
  frozenLastReadAt: string | null | undefined;
  todos: ProjectTodoType[];
  /** List returned for the current period & people filters (includes server-side filtering). */
  assigneeScopedTodos: ProjectTodoType[];
  /** After debounced description search (`debouncedTodoSearchQuery`). */
  filteredTodos: ProjectTodoType[];
  /** Debounced query from ProjectTodoLocalSearch; tables filter on this. */
  debouncedTodoSearchQuery: string;
  setDebouncedTodoSearchQuery: (value: string) => void;
  /** Single project member — hide member lists, reassign, and add-row assignee picker. */
  isSoleProjectMember: boolean;
  /** Solo project + every visible regular to-do is assigned to the viewer — flat list, no assignee headers. */
  hideRegularTodoAssigneeHeaders: boolean;
};

export type UseProjectTodosPanelArgs = {
  owner: LightWorkspaceType;
  spaceId: string;
  isReadOnly?: boolean;
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
};
