import { ProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/ProjectTodosPanel";
import { SpaceUserProjectDigest } from "@app/components/assistant/conversation/space/conversations/SpaceUserProjectDigest";
import { useSpaceUnreadConversationIds } from "@app/hooks/conversations";
import type { GetSpaceResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { LightWorkspaceType } from "@app/types/user";

interface SpaceTodoTabProps {
  owner: LightWorkspaceType;
  spaceInfo: GetSpaceResponseBody["space"];
  hasConversations: boolean;
}

export function SpaceTodoTab({
  owner,
  spaceInfo,
  hasConversations,
}: SpaceTodoTabProps) {
  const { unreadConversationIds } = useSpaceUnreadConversationIds({
    workspaceId: owner.sId,
    spaceId: spaceInfo.sId,
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
        <SpaceUserProjectDigest
          owner={owner}
          space={spaceInfo}
          hasConversations={hasConversations}
          unreadCount={unreadConversationIds.length}
        />
        <ProjectTodosPanel owner={owner} spaceId={spaceInfo.sId} />
      </div>
    </div>
  );
}
