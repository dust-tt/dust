import { NavigationListItem, NavigationListItemAction } from "@dust-tt/sparkle";
import { memo, useContext } from "react";

import {
  ProjectMenu,
  useProjectMenu,
} from "@app/components/assistant/conversation/ProjectMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { useConversation } from "@app/lib/swr/conversations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import { getProjectRoute } from "@app/lib/utils/router";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { SpaceType, WorkspaceType } from "@app/types";

interface ProjectsListProps {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
  titleFilter: string;
}

const ProjectListItem = memo(
  ({
    space,
    unreadCount,
    owner,
  }: {
    space: SpaceType;
    unreadCount: number;
    owner: WorkspaceType;
  }) => {
    const router = useAppRouter();
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);

    const spacePath = getProjectRoute(owner.sId, space.sId);

    const { isMenuOpen, menuTriggerPosition, handleMenuOpenChange } =
      useProjectMenu();

    const activeConversationId = useActiveConversationId();
    const { conversation } = useConversation({
      conversationId: activeConversationId,
      workspaceId: owner.sId,
    });

    const isSpaceSelected =
      router.asPath.startsWith(spacePath) ||
      conversation?.spaceId === space.sId;

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
        moreMenu={
          <ProjectMenu
            activeSpaceId={space.sId}
            space={space}
            owner={owner}
            trigger={<NavigationListItemAction />}
            isProjectDisplayed={router.query.cId === space.sId}
            isOpen={isMenuOpen}
            onOpenChange={handleMenuOpenChange}
            triggerPosition={menuTriggerPosition}
          />
        }
      />
    );
  }
);

ProjectListItem.displayName = "ProjectListItem";

export function ProjectsList({
  owner,
  summary,
  titleFilter,
}: ProjectsListProps) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (!hasFeature("projects")) {
    return null;
  }

  if (!summary || summary.length === 0) {
    return null;
  }

  const filteredSummary = titleFilter
    ? summary.filter(({ space }) =>
        subFilter(
          removeDiacritics(titleFilter).toLowerCase(),
          removeDiacritics(space.name).toLowerCase()
        )
      )
    : summary;
  if (filteredSummary.length === 0) {
    return null;
  }

  return (
    <>
      {filteredSummary.map(({ space, unreadConversations }) => (
        <ProjectListItem
          key={space.sId}
          space={space}
          unreadCount={unreadConversations.length}
          owner={owner}
        />
      ))}
    </>
  );
}
