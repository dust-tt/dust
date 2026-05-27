import type { TaskOwnerFilter } from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { PodTaskCreateBar } from "@app/components/pod/tasks/PodTaskCreateBar";
import { PodTasksPanelProvider } from "@app/components/pod/tasks/PodTasksPanelContext";
import { PodTasksPanelMain } from "@app/components/pod/tasks/PodTasksPanelMain";
import { PodTasksToolbar } from "@app/components/pod/tasks/PodTasksToolbar";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";

interface PodTasksTabProps {
  owner: WorkspaceType;
  podInfo: PodType;
  taskOwnerFilter: TaskOwnerFilter;
  onTaskOwnerFilterChange: (value: TaskOwnerFilter) => void;
}

export function PodTasksTab({
  owner,
  podInfo,
  taskOwnerFilter,
  onTaskOwnerFilterChange,
}: PodTasksTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
        <PodTasksPanelProvider
          owner={owner}
          podId={podInfo.sId}
          isReadOnly={!!podInfo.archivedAt || !podInfo.isMember}
          taskOwnerFilter={taskOwnerFilter}
          onTaskOwnerFilterChange={onTaskOwnerFilterChange}
        >
          <div className="flex flex-col gap-3">
            <PodTaskCreateBar />
            <PodTasksToolbar />
            <PodTasksPanelMain />
          </div>
        </PodTasksPanelProvider>
      </div>
    </div>
  );
}
