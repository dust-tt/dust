import {
  ProjectTodosPanel,
  type TodoOwnerFilter,
} from "@app/components/assistant/conversation/space/conversations/ProjectTodosPanel";
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
    <div className="flex h-full min-h-0 w-full flex-1 overflow-y-auto px-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col py-8">
        <ProjectTodosPanel
          owner={owner}
          spaceId={spaceInfo.sId}
          isReadOnly={!!spaceInfo.archivedAt || !spaceInfo.isMember}
          todoOwnerFilter={todoOwnerFilter}
          onTodoOwnerFilterChange={onTodoOwnerFilterChange}
        />
      </div>
    </div>
  );
}
