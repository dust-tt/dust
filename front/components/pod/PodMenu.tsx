import { EditPodTitleDialog } from "@app/components/pod/EditPodTitleDialog";
import { LeavePodDialog } from "@app/components/pod/LeavePodDialog";
import { useArchivePod } from "@app/hooks/useArchivePod";
import { useLeavePodDialog } from "@app/hooks/useLeaveProjectDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useURLSheet } from "@app/hooks/useURLSheet";
import config from "@app/lib/api/config";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useStarPod } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import {
  getConversationRoute,
  getPodRoute,
  setQueryParam,
} from "@app/lib/utils/router";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Edit04,
  EyeOff,
  Link01,
  Star01,
  UserSquare,
  XClose,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { PodNotificationMenu } from "./settings/PodNotificationMenu";

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
export function usePodMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuTriggerPosition, setMenuTriggerPosition] = useState<
    { x: number; y: number } | undefined
  >();

  // Tracks the closing animation so the menu stays stable and cannot reopen mid-exit.
  const [wasMenuJustClosed, setWasMenuJustClosed] = useState(false);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    setWasMenuJustClosed(!open);
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

  // Keep the menu data and trigger position until the closing animation completes.
  useEffect(() => {
    if (!wasMenuJustClosed) {
      return;
    }

    const closeAnimationTimeoutId = setTimeout(() => {
      setWasMenuJustClosed(false);
      setMenuTriggerPosition(undefined);
    }, 150);

    return () => clearTimeout(closeAnimationTimeoutId);
  }, [wasMenuJustClosed]);

  return {
    isMenuOpen,
    isMenuOpenOrClosing: isMenuOpen || wasMenuJustClosed,
    menuTriggerPosition,
    handleRightClick,
    handleMenuOpenChange,
  };
}

interface PodMenuProps {
  activePodId: string | null;
  pod?: PodType;
  owner: WorkspaceType;
  isStarred: boolean;
  trigger: ReactElement;
  isPodDisplayed: boolean;
  isOpen: boolean;
  isOpenOrClosing: boolean;
  onOpenChange: (open: boolean) => void;
  triggerPosition?: { x: number; y: number };
}

export function PodMenu({
  activePodId,
  pod,
  owner,
  isStarred,
  trigger,
  isPodDisplayed,
  isOpen,
  isOpenOrClosing,
  onOpenChange,
  triggerPosition,
}: PodMenuProps) {
  const { user } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const { onOpenChange: onOpenChangeUserModal } = useURLSheet("userDetails");

  const handleSeeUserDetails = (userId: string) => {
    onOpenChangeUserModal(true);
    setQueryParam(router, "userDetails", userId);
  };

  const shouldWaitBeforeFetching =
    activePodId === null || user?.sId === undefined || !isOpenOrClosing;

  const { spaceInfo: podInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: activePodId,
    disabled: shouldWaitBeforeFetching,
    includeAllMembers: true,
  });
  const [showRenameDialog, setShowRenameDialog] = useState<boolean>(false);

  const starPod = useStarPod({
    workspaceId: owner.sId,
    podId: activePodId,
  });

  const shareLink = activePodId
    ? `${config.getApiBaseUrl()}${getPodRoute(owner.sId, activePodId)}`
    : undefined;

  const spaceName = pod?.name ?? podInfo?.name ?? "";
  const userName = user?.fullName ?? user?.username ?? "";

  const handleLeaveSuccess = useCallback(() => {
    if (isPodDisplayed) {
      void router.push(getConversationRoute(owner.sId));
    }
  }, [isPodDisplayed, owner.sId, router]);

  const { leaveDialogProps, openLeaveDialog } = useLeavePodDialog({
    owner,
    podId: activePodId ?? "",
    podName: spaceName,
    isRestricted: podInfo?.isRestricted ?? true,
    userName,
    onSuccess: handleLeaveSuccess,
  });

  const copyPodLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink ?? "");
    sendNotification({ type: "success", title: "Link copied !" });
  }, [shareLink, sendNotification]);

  const handleArchiveSuccess = useCallback(() => {
    if (isPodDisplayed) {
      void router.push(getConversationRoute(owner.sId));
    }
  }, [isPodDisplayed, owner.sId, router]);

  const { archivePod } = useArchivePod({
    owner,
    podId: activePodId ?? "",
    onSuccess: handleArchiveSuccess,
  });

  if (!activePodId) {
    return null;
  }

  // Determine permissions based on spaceInfo
  const isPod = pod?.kind === "project" || podInfo?.kind === "project";
  const isMember = podInfo?.isMember ?? false;
  // podInfo.isEditor is canAdministrate (true for workspace admins on
  // admin-controlled Pods; true for Pod editors otherwise).
  const canAdministratePod = podInfo?.isEditor ?? false;
  const podEditors =
    podInfo?.members?.filter((member) => member.isEditor) ?? [];
  const isPodEditor = podEditors.some((member) => member.sId === user.sId);
  const canLeave =
    isPod &&
    ((isMember && !isPodEditor) || // regular members can leave
      (isPodEditor && podEditors.length > 1)); // editors can leave if there's at least another editor
  // Must match PATCH /spaces/[spaceId] (canAdministrate). canWrite is true for pod members too.
  const canRename = canAdministratePod;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <LeavePodDialog {...leaveDialogProps} />
      {showRenameDialog && pod && (
        <EditPodTitleDialog
          isOpen={showRenameDialog}
          onClose={() => setShowRenameDialog(false)}
          owner={owner}
          podId={activePodId}
          currentTitle={pod.name}
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
        <DropdownMenuContent onFocusOutside={(e) => e.preventDefault()}>
          <DropdownMenuLabel label="My settings" />
          <DropdownMenuItem
            label={isStarred ? "Remove from starred" : "Add to starred"}
            icon={Star01}
            onClick={() => void starPod(!isStarred)}
          />
          {canLeave && (
            <DropdownMenuItem
              label="Leave"
              onClick={openLeaveDialog}
              icon={XClose}
            />
          )}
          <PodNotificationMenu
            activePodId={activePodId}
            owner={owner}
            shouldWaitBeforeFetching={shouldWaitBeforeFetching}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel label="Pod" />
          {canRename && (
            <DropdownMenuItem
              label="Rename"
              onClick={() => setShowRenameDialog(true)}
              icon={Edit04}
            />
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger
              icon={UserSquare}
              disabled={!podInfo?.members?.length}
              label="Member list"
            />
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {podInfo?.members.map((member) => (
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
                    // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
                    className="text-foreground!"
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          {canAdministratePod && (
            <DropdownMenuItem
              label="Archive"
              onClick={archivePod}
              icon={EyeOff}
              variant="warning"
            />
          )}
          {shareLink && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel label="Share" />
              <DropdownMenuItem
                label="Copy link"
                onClick={copyPodLink}
                icon={Link01}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
