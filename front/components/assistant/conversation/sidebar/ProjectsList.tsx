import {
  ProjectMenu,
  useProjectMenu,
} from "@app/components/assistant/conversation/ProjectMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useConversation } from "@app/hooks/conversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useMoveConversationToProject } from "@app/hooks/useMoveConversationToProject";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import { getProjectRoute } from "@app/lib/utils/router";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { NavigationListItem, NavigationListItemAction } from "@dust-tt/sparkle";
import { memo, useCallback, useContext, useRef, useState } from "react";

interface ProjectsListProps {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
  titleFilter: string;
}

const ProjectListItem = memo(
  ({
    space,
    unreadCount,
    hasUnread,
    owner,
    moveConversationToProject,
  }: {
    space: SpaceType;
    unreadCount: number;
    hasUnread: boolean;
    owner: WorkspaceType;
    moveConversationToProject: (
      conversation: ConversationWithoutContentType,
      space: SpaceType
    ) => Promise<boolean>;
  }) => {
    const router = useAppRouter();
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
    const dropZoneRef = useRef<HTMLDivElement>(null);

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

    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDragOver(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragOver(false);
      }
    };

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        setIsDragOver(false);
        dragCounterRef.current = 0;
        const conversationId = e.dataTransfer.getData(
          "application/x-dust-conversation"
        );
        if (!conversationId) {
          return;
        }

        try {
          const conversationData = e.dataTransfer.getData("application/json");
          if (conversationData) {
            const conversationObj = JSON.parse(
              conversationData
            ) as ConversationWithoutContentType;
            await moveConversationToProject(conversationObj, space);
          }
        } catch (error) {
          console.error("Error parsing conversation data:", error);
        }
      },
      [moveConversationToProject, space]
    );

    return (
      <NavigationListItem
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={isDragOver ? "ring-2 ring-inset rounded-xl" : ""}
        icon={getSpaceIcon(space)}
        selected={isSpaceSelected && !isDragOver}
        label={space.name}
        bold={hasUnread}
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
            isProjectDisplayed={activeConversationId === space.sId}
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

  const moveConversationToProject = useMoveConversationToProject(owner);

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
      {filteredSummary.map(
        ({ space, unreadConversations, nonParticipantUnreadConversations }) => (
          <ProjectListItem
            key={space.sId}
            space={space}
            unreadCount={unreadConversations.length}
            hasUnread={
              unreadConversations.length > 0 ||
              nonParticipantUnreadConversations.length > 0
            }
            owner={owner}
            moveConversationToProject={moveConversationToProject}
          />
        )
      )}
    </>
  );
}
