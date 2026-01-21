import { NavigationListItem } from "@dust-tt/sparkle";
import { memo, useContext } from "react";

import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getSpaceConversationsRoute } from "@app/lib/utils/router";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type {
  ConversationWithoutContentType,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { isString } from "@app/types";

interface ProjectsListProps {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
}

const ProjectListItem = memo(
  ({
    space,
    conversations,
    unreadCount,
    owner,
  }: {
    space: SpaceType;
    conversations: ConversationWithoutContentType[];
    unreadCount: number;
    owner: WorkspaceType;
  }) => {
    const router = useAppRouter();
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

    const spacePath = getSpaceConversationsRoute(owner.sId, space.sId);

    const { cId } = router.query;

    const currentConversationId = isString(cId) ? cId : undefined;

    const conversationIds = new Set(
      conversations.map((conversation) => conversation.sId)
    );

    const isSpaceSelected =
      router.asPath.startsWith(spacePath) ||
      (currentConversationId !== undefined &&
        conversationIds.has(currentConversationId));

    return (
      <NavigationListItem
        icon={getSpaceIcon(space)}
        selected={isSpaceSelected}
        label={space.name}
        count={unreadCount > 0 ? unreadCount : undefined}
        onClick={async () => {
          // Side bar is the floating sidebar that appears when the screen is small.
          if (sidebarOpen) {
            setSidebarOpen(false);
            // Wait a bit before moving to the new space to avoid the sidebar from flickering.
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
          await router.push(spacePath, undefined, {
            shallow: true,
          });
        }}
      />
    );
  }
);

ProjectListItem.displayName = "ProjectListItem";

export function ProjectsList({ owner, summary }: ProjectsListProps) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (!hasFeature("projects")) {
    return null;
  }

  if (!summary || summary.length === 0) {
    return null;
  }

  return (
    <>
      {summary.map(({ space, unreadConversations, conversations }) => (
        <ProjectListItem
          key={space.sId}
          space={space}
          unreadCount={unreadConversations.length}
          conversations={conversations}
          owner={owner}
        />
      ))}
    </>
  );
}
