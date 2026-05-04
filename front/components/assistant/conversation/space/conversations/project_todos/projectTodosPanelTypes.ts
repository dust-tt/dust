import type { ProjectTodosDataTable } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosDataTable";
import type { TodoOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
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
  assigneeSearch: string;
  setAssigneeSearch: Dispatch<SetStateAction<string>>;
  isAssigneeMenuOpen: boolean;
  setIsAssigneeMenuOpen: Dispatch<SetStateAction<boolean>>;
  filteredUsers: ProjectTodoAssigneeType[];
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
  selectedUserSIds: Set<string>;
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
  isAddTodoComposerOpen: boolean;
  setIsAddTodoComposerOpen: Dispatch<SetStateAction<boolean>>;
  handleAddTodo: (text: string, assigneeSId: string) => Promise<boolean>;
  isTodosLoading: boolean;
  frozenLastReadAt: string | null | undefined;
  filteredTodos: ProjectTodoType[];
};

export type UseProjectTodosPanelArgs = {
  owner: LightWorkspaceType;
  spaceId: string;
  isReadOnly?: boolean;
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
};
