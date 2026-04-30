import { ProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/ProjectTodosPanel";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";

interface SpaceTodosTabProps {
  owner: WorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
}

export function SpaceTodosTab({ owner, spaceInfo }: SpaceTodosTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-y-auto px-6">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col py-8">
        <ProjectTodosPanel
          owner={owner}
          spaceId={spaceInfo.sId}
          isReadOnly={!!spaceInfo.archivedAt || !spaceInfo.isMember}
        />
      </div>
    </div>
  );
}
