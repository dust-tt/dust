import { LeavePodDialog } from "@app/components/pod/LeavePodDialog";
import { useLeavePodDialog } from "@app/hooks/useLeaveProjectDialog";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import type {
  LightWorkspaceType,
  SpaceUserType,
  UserType,
} from "@app/types/user";
import {
  Avatar,
  Button,
  DotsHorizontalV2,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  XCloseV2,
} from "@dust-tt/sparkle";
import { useCallback } from "react";
import { PodNotificationMenu } from "./settings/PodNotificationMenu";

interface PodHeaderActionsProps {
  isMember: boolean;
  isRestricted: boolean;
  members: SpaceUserType[];
  owner: LightWorkspaceType;
  podId: string;
  podName: string;
  user: UserType;
}

export function PodHeaderActions({
  isMember,
  isRestricted,
  members,
  owner,
  podId,
  podName,
  user,
}: PodHeaderActionsProps) {
  const router = useAppRouter();

  const handleLeaveSuccess = useCallback(() => {
    if (isRestricted) {
      void router.push(getConversationRoute(owner.sId));
    } else {
      void router.push(getPodRoute(owner.sId, podId));
    }
  }, [isRestricted, owner.sId, router, podId]);

  const { leaveDialogProps, openLeaveDialog } = useLeavePodDialog({
    owner,
    podId,
    podName,
    isRestricted,
    userName: user.fullName,
    onSuccess: handleLeaveSuccess,
  });

  const podEditors = members.filter((member) => member.isEditor);
  const isPodEditor = podEditors.some((member) => member.sId === user.sId);
  const canLeavePod =
    (isMember && !isPodEditor) || // regular members can leave the pod
    (isPodEditor && podEditors.length > 1); // editors can leave if there's at least another editor
  return (
    <>
      <div className="flex items-center gap-2">
        {members.length > 0 && (
          <div className="hidden sm:flex sm:h-9 sm:items-center">
            <Avatar.Stack
              avatars={members.map((member) => ({
                name: member.fullName ?? member.username,
                visual: member.image ?? undefined,
                isRounded: true,
              }))}
              nbVisibleItems={5}
              size="sm"
            />
          </div>
        )}
        {isMember && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={DotsHorizontalV2}
                variant="ghost"
                size="sm"
                tooltip="Pod options"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent collisionPadding={8}>
              {!canLeavePod ? (
                <DropdownTooltipTrigger
                  description="You are the last editor of this Pod and cannot leave it."
                  side="left"
                >
                  <DropdownMenuItem
                    label="Leave the Pod"
                    icon={XCloseV2}
                    disabled={true}
                  />
                </DropdownTooltipTrigger>
              ) : (
                <DropdownMenuItem
                  label="Leave the Pod"
                  icon={XCloseV2}
                  onClick={openLeaveDialog}
                />
              )}
              <PodNotificationMenu
                activePodId={podId}
                owner={owner}
                shouldWaitBeforeFetching={false}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <LeavePodDialog {...leaveDialogProps} />
    </>
  );
}
