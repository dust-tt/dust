import { PodMenu, usePodMenu } from "@app/components/pod/PodMenu";
import { SidebarContext } from "@app/components/sparkle/SidebarContext";
import { useConversation } from "@app/hooks/conversations";
import { usePodConversations } from "@app/hooks/conversations/usePodConversations";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import type { GetBySpacesSummaryResponseBody } from "@app/lib/api/assistant/conversation/spaces";
import { useAppRouter } from "@app/lib/platform";
import { getSpaceIcon } from "@app/lib/spaces";
import { removeDiacritics, subFilter } from "@app/lib/utils";
import { getPodRoute } from "@app/lib/utils/router";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { NavigationListItem, NavigationListItemAction } from "@dust-tt/sparkle";
import { memo, useCallback, useContext, useRef, useState } from "react";

interface PodListItemProps {
  pod: PodType;
  isStarred: boolean;
  unreadCount: number;
  hasUnread: boolean;
  owner: WorkspaceType;
  moveConversationToPod: (
    conversation: ConversationWithoutContentType,
    pod: PodType
  ) => Promise<boolean>;
}

const PodListItem = memo(
  ({
    pod,
    isStarred,
    unreadCount,
    hasUnread,
    owner,
    moveConversationToPod,
  }: PodListItemProps) => {
    const router = useAppRouter();
    const { sidebarOpen, setSidebarOpen } = useContext(SidebarContext);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const podPath = getPodRoute(owner.sId, pod.sId);

    const { isMenuOpen, menuTriggerPosition, handleMenuOpenChange } =
      usePodMenu();

    const activeConversationId = useActiveConversationId();
    const { conversation } = useConversation({
      conversationId: activeConversationId,
      workspaceId: owner.sId,
    });

    const { mutateConversations: mutateAllConversations } = usePodConversations(
      {
        workspaceId: owner.sId,
        podId: pod.sId,
        filter: "all",
        options: { disabled: true },
      }
    );
    const { mutateConversations: mutateWithMeConversations } =
      usePodConversations({
        workspaceId: owner.sId,
        podId: pod.sId,
        filter: "with_me",
        options: { disabled: true },
      });
    const { mutateConversations: mutateGroupConversations } =
      usePodConversations({
        workspaceId: owner.sId,
        podId: pod.sId,
        filter: "group",
        options: { disabled: true },
      });

    const isSpaceSelected =
      router.asPath.startsWith(podPath) || conversation?.spaceId === pod.sId;

    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragStart = (e: React.DragEvent) => {
      e.preventDefault();
    };

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
            const success = await moveConversationToPod(conversationObj, pod);
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
        moveConversationToPod,
        pod,
        mutateAllConversations,
        mutateWithMeConversations,
        mutateGroupConversations,
      ]
    );

    return (
      <NavigationListItem
        ref={dropZoneRef}
        onDragStart={handleDragStart}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={isDragOver ? "ring-2 ring-inset rounded-xl" : ""}
        icon={getSpaceIcon(pod)}
        selected={isSpaceSelected && !isDragOver}
        label={pod.name}
        href={podPath}
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
          <PodMenu
            activePodId={pod.sId}
            pod={pod}
            owner={owner}
            isStarred={isStarred}
            trigger={<NavigationListItemAction />}
            isPodDisplayed={activeConversationId === pod.sId}
            isOpen={isMenuOpen}
            onOpenChange={handleMenuOpenChange}
            triggerPosition={menuTriggerPosition}
          />
        }
      />
    );
  }
);

export function renderPodsList({
  owner,
  summary,
  titleFilter,
  moveConversationToPod: moveConversationToPod,
}: {
  owner: WorkspaceType;
  summary: GetBySpacesSummaryResponseBody["summary"];
  titleFilter: string;
  moveConversationToPod: (
    conversation: ConversationWithoutContentType,
    pod: PodType
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
      <PodListItem
        key={space.sId}
        pod={space}
        isStarred={space.isStarred}
        unreadCount={unreadConversations.length}
        hasUnread={
          unreadConversations.length > 0 ||
          nonParticipantUnreadConversations.length > 0
        }
        owner={owner}
        moveConversationToPod={moveConversationToPod}
      />
    )
  );
}
