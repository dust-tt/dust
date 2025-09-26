import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  LinkIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import { DeleteConversationsDialog } from "@app/components/assistant/conversation/DeleteConversationsDialog";
import { EditConversationTitleDialog } from "@app/components/assistant/conversation/EditConversationTitleDialog";
import { LeaveConversationDialog } from "@app/components/assistant/conversation/LeaveConversationDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useConversationParticipants,
  useConversationParticipationOption,
  useDeleteConversation,
  useJoinConversation,
} from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

/**
 * Hook for handling right-click context menu with timing protection
 *
 * This hook solves the "double right-click" problem where right-clicking while
 * a menu is open would cause it to close and immediately reopen at the cursor position.
 *
 * The core issue: DropdownMenu doesn't add a backdrop to catch events, so right-clicks
 * while the menu is open still trigger our handlers. Due to React's async state updates,
 * when the menu closes, our right-click handler sees isMenuOpen as false and reopens the menu.
 */
export function useConversationRightClick(
  isMenuOpen: boolean,
  setMenuTriggerPosition: (
    position: { x: number; y: number } | undefined
  ) => void,
  setIsMenuOpen: (open: boolean) => void
) {
  // Tracks if the menu was just closed to prevent immediate reopening
  // This flag creates a brief "cooldown" period after menu closure
  const [wasMenuJustClosed, setWasMenuJustClosed] = useState(false);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setIsMenuOpen(open);
      if (!open) {
        // When menu closes, set the "just closed" flag for 100ms
        // This prevents right-click handlers from immediately reopening the menu
        setWasMenuJustClosed(true);
        setTimeout(() => {
          setWasMenuJustClosed(false);
        }, 100);
      }
    },
    [setIsMenuOpen]
  );

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore right-clicks if menu is currently open OR was just closed
      // This prevents the close -> immediate reopen behavior
      if (isMenuOpen || wasMenuJustClosed) {
        return;
      }

      // Open menu at cursor position
      setMenuTriggerPosition({ x: e.clientX, y: e.clientY });
      setIsMenuOpen(true);
    },
    [isMenuOpen, wasMenuJustClosed, setMenuTriggerPosition, setIsMenuOpen]
  );

  // Clear the trigger position when menu closes to allow animations to complete
  // The 150ms delay ensures smooth closing animation before position reset
  useEffect(() => {
    if (!isMenuOpen && setMenuTriggerPosition) {
      setTimeout(() => {
        setMenuTriggerPosition(undefined);
      }, 150);
    }
  }, [isMenuOpen, setMenuTriggerPosition]);

  return { handleRightClick, handleMenuOpenChange };
}

export function ConversationMenu({
  activeConversationId,
  conversation,
  owner,
  trigger,
  isConversationDisplayed,
  isOpen,
  onOpenChange,
  triggerPosition,
}: {
  activeConversationId: string | null;
  conversation: ConversationWithoutContentType | null;
  owner: WorkspaceType;
  trigger: ReactElement;
  isConversationDisplayed: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition?: { x: number; y: number };
}) {
  const { user } = useUser();
  const router = useRouter();
  const sendNotification = useSendNotification();

  const shouldWaitBeforeFetching =
    activeConversationId === null || user?.sId === undefined || !isOpen;
  const conversationParticipationOption = useConversationParticipationOption({
    ownerId: owner.sId,
    conversationId: activeConversationId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    userId: user?.sId || null,
    disabled: shouldWaitBeforeFetching,
  });
  const { conversationParticipants } = useConversationParticipants({
    conversationId: activeConversationId,
    workspaceId: owner.sId,
    options: {
      disabled: shouldWaitBeforeFetching,
    },
  });
  const joinConversation = useJoinConversation({
    ownerId: owner.sId,
    conversationId: activeConversationId,
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState<boolean>(false);
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);

  const baseUrl = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  const shareLink =
    baseUrl !== undefined
      ? `${baseUrl}/w/${owner.sId}/assistant/${activeConversationId}`
      : undefined;

  const doDelete = useDeleteConversation(owner);
  const leaveOrDelete = useCallback(async () => {
    const res = await doDelete(conversation);
    isConversationDisplayed &&
      res &&
      void router.push(`/w/${owner.sId}/assistant/new`);
  }, [conversation, doDelete, owner.sId, router, isConversationDisplayed]);

  const copyConversationLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink ?? "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [shareLink, sendNotification]);

  if (!activeConversationId) {
    return null;
  }

  const ConversationActionMenuItem = () => {
    switch (conversationParticipationOption) {
      case "delete":
        return (
          <DropdownMenuItem
            label="Delete"
            onClick={() => setShowDeleteDialog(true)}
            icon={TrashIcon}
          />
        );
      case "leave":
        return (
          <DropdownMenuItem
            label="Leave"
            onClick={() => setShowLeaveDialog(true)}
            icon={XMarkIcon}
          />
        );
      case "join":
        return (
          <DropdownMenuItem
            label="Join"
            onClick={joinConversation}
            icon={PlusCircleIcon}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DeleteConversationsDialog
        isOpen={showDeleteDialog}
        type="selection"
        selectedCount={1}
        onClose={() => setShowDeleteDialog(false)}
        onDelete={() => {
          setShowDeleteDialog(false);
          void leaveOrDelete();
        }}
      />
      <LeaveConversationDialog
        isOpen={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        onLeave={() => {
          setShowLeaveDialog(false);
          void leaveOrDelete();
        }}
      />
      <EditConversationTitleDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        ownerId={owner.sId}
        conversationId={activeConversationId}
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        currentTitle={conversation?.title || ""}
      />
      <DropdownMenu modal={false} open={isOpen} onOpenChange={onOpenChange}>
        {triggerPosition ? (
          <>
            {trigger}
            <DropdownMenuTrigger asChild>
              <div
                style={{
                  position: "fixed",
                  left: triggerPosition.x,
                  top: triggerPosition.y,
                  width: 0,
                  height: 0,
                  pointerEvents: "none",
                }}
              />
            </DropdownMenuTrigger>
          </>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent>
          <DropdownMenuLabel>Conversation</DropdownMenuLabel>
          <DropdownMenuItem
            label="Rename"
            onClick={() => setShowRenameDialog(true)}
            icon={PencilSquareIcon}
          />

          <ConversationActionMenuItem />

          {shareLink && (
            <>
              <DropdownMenuLabel>Share the conversation</DropdownMenuLabel>
              <DropdownMenuItem
                label="Copy the link"
                onClick={copyConversationLink}
                icon={LinkIcon}
              />
            </>
          )}

          {conversationParticipants === undefined ? null : (
            <>
              {conversationParticipants?.users.length > 0 && (
                <>
                  <DropdownMenuLabel>Participants</DropdownMenuLabel>
                  {conversationParticipants.users.map((user) => (
                    <DropdownMenuItem
                      key={user.sId}
                      label={asDisplayName(user.username)}
                      icon={
                        <Avatar
                          size="xs"
                          visual={user.pictureUrl}
                          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                          name={user.fullName || user.username}
                        />
                      }
                      disabled
                      className="!text-foreground dark:!text-foreground-night"
                    />
                  ))}
                </>
              )}
              {conversationParticipants.agents.length > 0 && (
                <>
                  <DropdownMenuLabel>Agents</DropdownMenuLabel>
                  {conversationParticipants.agents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.configurationId}
                      label={agent.name}
                      icon={
                        <Avatar
                          size="xs"
                          visual={agent.pictureUrl}
                          name={agent.name}
                        />
                      }
                      disabled
                      className="!text-foreground dark:!text-foreground-night"
                    />
                  ))}
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
