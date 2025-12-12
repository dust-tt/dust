import { NavigationListItem } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { memo, useContext } from "react";

import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { getSpaceIcon } from "@app/lib/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getSpaceConversationsRoute } from "@app/lib/utils/router";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { SpaceType, WorkspaceType } from "@app/types";
interface SpacesListProps {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
}

const SpaceListItem = memo(
  ({
    space,
    unreadCount,
    owner,
  }: {
    space: SpaceType;
    unreadCount: number;
    owner: WorkspaceType;
  }) => {
    const router = useRouter();
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

    const spacePath = getSpaceConversationsRoute(owner.sId, space.sId);
    const spaceLabel = `${space.name}${unreadCount > 0 ? ` (${unreadCount})` : ""}`;

    return (
      <NavigationListItem
        icon={getSpaceIcon(space)}
        selected={router.asPath.startsWith(spacePath)}
        status={unreadCount > 0 ? "unread" : "idle"}
        label={spaceLabel}
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

SpaceListItem.displayName = "SpaceListItem";

export function SpacesList({ owner, summary }: SpacesListProps) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (!hasFeature("conversations_groups")) {
    return null;
  }

  if (!summary || summary.length === 0) {
    return null;
  }

  return (
    <div className="mx-3 flex flex-col gap-0.5">
      {summary.map(({ space, unreadConversations }) => (
        <SpaceListItem
          key={space.sId}
          space={space}
          unreadCount={unreadConversations.length}
          owner={owner}
        />
      ))}
    </div>
  );
}
