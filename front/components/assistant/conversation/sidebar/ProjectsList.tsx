import {
  ProjectMenu,
  useProjectMenu,
} from "@app/components/assistant/conversation/ProjectMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useConversation } from "@app/hooks/conversations";
import { usePodConversations } from "@app/hooks/conversations/usePodConversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import { getPodRoute } from "@app/lib/utils/router";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { NavigationListItem, NavigationListItemAction } from "@dust-tt/sparkle";
import { memo, useCallback, useContext, useRef, useState } from "react";

const ProjectListItem = memo(
  ({
    space,
    isStarred,
    unreadCount,
    hasUnread,
    owner,
    moveConversationToProject,
  }: {
    space: SpaceType;
    isStarred: boolean;
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

    const spacePath = getPodRoute(owner.sId, space.sId);

    const { isMenuOpen, menuTriggerPosition, handleMenuOpenChange } =
      useProjectMenu();

    const activeConversationId = useActiveConversationId();
    const { conversation } = useConversation({
      conversationId: activeConversationId,
      workspaceId: owner.sId,
    });

    const { mutateConversations: mutateAllConversations } = usePodConversations(
      {
        workspaceId: owner.sId,
        podId: space.sId,
        filter: "all",
        options: { disabled: true },
      }
    );
    const { mutateConversations: mutateWithMeConversations } =
      usePodConversations({
        workspaceId: owner.sId,
        podId: space.sId,
        filter: "with_me",
        options: { disabled: true },
      });
    const { mutateConversations: mutateGroupConversations } =
      usePodConversations({
        workspaceId: owner.sId,
        podId: space.sId,
        filter: "group",
        options: { disabled: true },
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
            const success = await moveConversationToProject(
              conversationObj,
              space
            );
            if (success) {
              void mutateAllConversations();
              void mutateWithMeConversations();
              void mutateGroupConversations();
            }
          }
        } catch (error) {
          console.error("Error parsing conversation data:", error);
        }
      },
      [
        moveConversationToProject,
        space,
        mutateAllConversations,
        mutateWithMeConversations,
        mutateGroupConversations,
      ]
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
        href={spacePath}
        shallow
        hasActivity={hasUnread}
        count={unreadCount > 0 ? unreadCount : undefined}
        onClick={async () => {
          // Side bar is the floating sidebar that appears when the screen is small.
          if (sidebarOpen) {
            setSidebarOpen(false);
            // Wait a bit before moving to the new space to avoid the sidebar from flickering.
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }}
        moreMenu={
          <ProjectMenu
            activeSpaceId={space.sId}
            space={space}
            owner={owner}
            isStarred={isStarred}
            trigger={<NavigationListItemAction forceVisible={isMenuOpen} />}
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

export function renderProjectsList({
  owner,
  summary,
  titleFilter,
  moveConversationToProject,
}: {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
  titleFilter: string;
  moveConversationToProject: (
    conversation: ConversationWithoutContentType,
    space: SpaceType
  ) => Promise<boolean>;
}) {
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

  return filteredSummary.map(
    ({ space, unreadConversations, nonParticipantUnreadConversations }) => (
      <ProjectListItem
        key={space.sId}
        space={space}
        isStarred={space.isStarred}
        unreadCount={unreadConversations.length}
        hasUnread={
          unreadConversations.length > 0 ||
          nonParticipantUnreadConversations.length > 0
        }
        owner={owner}
        moveConversationToProject={moveConversationToProject}
      />
    )
  );
}
