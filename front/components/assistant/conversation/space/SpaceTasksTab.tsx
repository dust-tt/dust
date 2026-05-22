import {
  ProjectTaskCreateBar,
  ProjectTasksPanelMain,
  ProjectTasksPanelProvider,
  ProjectTasksToolbar,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/EditableProjectTasksPanel";
import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";

interface SpaceTasksTabProps {
  owner: WorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
}

export function SpaceTasksTab({
  owner,
  spaceInfo,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: SpaceTasksTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
        <ProjectTasksPanelProvider
          owner={owner}
          spaceId={spaceInfo.sId}
          isReadOnly={!!spaceInfo.archivedAt || !spaceInfo.isMember}
          taskOwnerFilter={taskOwnerFilter}
          onTaskOwnerFilterChange={onTaskOwnerFilterChange}
        >
          <div className="flex flex-col gap-3">
            <ProjectTaskCreateBar />
            <ProjectTasksToolbar />
            <ProjectTasksPanelMain />
          </div>
        </ProjectTasksPanelProvider>
      </div>
    </div>
  );
}
