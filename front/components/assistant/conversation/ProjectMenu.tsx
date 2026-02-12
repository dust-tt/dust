import {
  Avatar,
  ContactsUserIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  LinkIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React from "react";
import { useCallback, useEffect, useState } from "react";

import { EditProjectTitleDialog } from "@app/components/assistant/conversation/EditProjectTitleDialog";
import { LeaveProjectDialog } from "@app/components/assistant/conversation/LeaveProjectDialog";
import { useLeaveProjectDialog } from "@app/hooks/useLeaveProjectDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useURLSheet } from "@app/hooks/useURLSheet";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import {
  getConversationRoute,
  getProjectRoute,
  setQueryParam,
} from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";

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
export function useProjectMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuTriggerPosition, setMenuTriggerPosition] = useState<
    { x: number; y: number } | undefined
  >();

  // Tracks if the menu was just closed to prevent immediate reopening
  // This flag creates a brief "cooldown" period after menu closure
  const [wasMenuJustClosed, setWasMenuJustClosed] = useState(false);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      // When menu closes, set the "just closed" flag for 100ms
      // This prevents right-click handlers from immediately reopening the menu
      setWasMenuJustClosed(true);
      setTimeout(() => {
        setWasMenuJustClosed(false);
      }, 100);
    }
  }, []);

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
    [isMenuOpen, wasMenuJustClosed]
  );

  // Clear the trigger position when menu closes to allow animations to complete
  // The 150ms delay ensures smooth closing animation before position reset
  useEffect(() => {
    if (!isMenuOpen) {
      setTimeout(() => {
        setMenuTriggerPosition(undefined);
      }, 150);
    }
  }, [isMenuOpen]);

  return {
    isMenuOpen,
    menuTriggerPosition,
    handleRightClick,
    handleMenuOpenChange,
  };
}

export function ProjectMenu({
  activeSpaceId,
  space,
  owner,
  trigger,
  isProjectDisplayed,
  isOpen,
  onOpenChange,
  triggerPosition,
}: {
  activeSpaceId: string | null;
  space?: SpaceType;
  owner: WorkspaceType;
  trigger: ReactElement;
  isProjectDisplayed: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition?: { x: number; y: number };
}) {
  const { user } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");

  const handleSeeUserDetails = (userId: string) => {
    onOpenChangeUserModal(true);
    setQueryParam(router, "userDetails", userId);
  };

  const shouldWaitBeforeFetching =
    activeSpaceId === null || user?.sId === undefined || !isOpen;

  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: activeSpaceId,
    disabled: shouldWaitBeforeFetching,
    includeAllMembers: true,
  });

  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);

  const baseUrl = process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL;
  const shareLink =
    baseUrl !== undefined && activeSpaceId
      ? `${baseUrl}${getProjectRoute(owner.sId, activeSpaceId)}`
      : undefined;

  const spaceName = space?.name ?? spaceInfo?.name ?? "";
  const userName = user?.fullName ?? user?.username ?? "";

  const handleLeaveSuccess = useCallback(() => {
    if (isProjectDisplayed) {
      void router.push(getConversationRoute(owner.sId));
    }
  }, [isProjectDisplayed, owner.sId, router]);

  const { leaveDialogProps, openLeaveDialog } = useLeaveProjectDialog({
    owner,
    spaceId: activeSpaceId ?? "",
    spaceName,
    isRestricted: spaceInfo?.isRestricted ?? true,
    userName,
    onSuccess: handleLeaveSuccess,
  });

  const copyProjectLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink ?? "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [shareLink, sendNotification]);

  if (!activeSpaceId) {
    return null;
  }

  // Determine permissions based on spaceInfo
  const isProject = space?.kind === "project" || spaceInfo?.kind === "project";
  const canLeave = (spaceInfo?.isMember ?? false) && isProject;
  const canRename = spaceInfo?.canWrite ?? false; // Only admins can rename

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <LeaveProjectDialog {...leaveDialogProps} />
      {showRenameDialog && space && (
        <EditProjectTitleDialog
          isOpen={showRenameDialog}
          onClose={() => setShowRenameDialog(false)}
          owner={owner}
          spaceId={activeSpaceId}
          currentTitle={space.name}
        />
      )}
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
          {canRename && (
            <DropdownMenuItem
              label="Rename"
              onClick={() => setShowRenameDialog(true)}
              icon={PencilSquareIcon}
            />
          )}
          {spaceInfo?.members && spaceInfo.members.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                icon={ContactsUserIcon}
                label="Member list"
              />
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {spaceInfo.members.map((member) => (
                    <DropdownMenuItem
                      key={member.sId}
                      label={member.fullName ?? member.username}
                      onClick={() => handleSeeUserDetails(member.sId)}
                      icon={
                        <Avatar
                          size="xs"
                          visual={member.image ?? undefined}
                          name={member.fullName ?? member.username}
                          isRounded
                        />
                      }
                      className="!text-foreground dark:!text-foreground-night"
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {shareLink && (
            <DropdownMenuItem
              label="Copy the link"
              onClick={copyProjectLink}
              icon={LinkIcon}
            />
          )}
          {canLeave && (
            <DropdownMenuItem
              label="Leave"
              onClick={openLeaveDialog}
              icon={XMarkIcon}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
