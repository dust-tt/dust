import {
  ProjectTodoLocalSearch,
  ProjectTodoScopeFilter,
  ProjectTodosPanelMain,
  ProjectTodosPanelProvider,
} from "@app/components/assistant/conversation/space/conversations/project_todos/EditableProjectTodosPanel";
import { SuggestedTodosGenerationTile } from "@app/components/assistant/conversation/space/conversations/project_todos/SuggestedTodosGenerationTile";
import type { TodoOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_todos/TodoSubComponents";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";

interface SpaceTodosTabProps {
  owner: WorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
  todoOwnerFilter: TodoOwnerFilter;
  onTodoOwnerFilterChange: (value: TodoOwnerFilter) => void;
}

export function SpaceTodosTab({
  owner,
  spaceInfo,
  todoOwnerFilter,
  onTodoOwnerFilterChange,
}: SpaceTodosTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 py-8">
        <ProjectTodosPanelProvider
          owner={owner}
          spaceId={spaceInfo.sId}
          isReadOnly={!!spaceInfo.archivedAt || !spaceInfo.isMember}
          todoOwnerFilter={todoOwnerFilter}
          onTodoOwnerFilterChange={onTodoOwnerFilterChange}
        >
          <ProjectTodoScopeFilter />
          <ProjectTodoLocalSearch />
          <SuggestedTodosGenerationTile owner={owner} spaceInfo={spaceInfo} />
          <ProjectTodosPanelMain />
        </ProjectTodosPanelProvider>
      </div>
    </div>
  );
}
