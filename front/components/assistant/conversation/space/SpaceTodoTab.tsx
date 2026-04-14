import { ProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/ProjectTodosPanel";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { LightWorkspaceType } from "@app/types/user";

interface SpaceTodoTabProps {
  owner: LightWorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
  hasConversations: boolean;
}

export function SpaceTodoTab({ owner, spaceInfo }: SpaceTodoTabProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <ProjectTodosPanel owner={owner} spaceId={spaceInfo.sId} />
      </div>
    </div>
  );
}
