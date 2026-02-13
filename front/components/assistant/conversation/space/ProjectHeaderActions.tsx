import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
  MoreIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

import { LeaveProjectDialog } from "@app/components/assistant/conversation/LeaveProjectDialog";
import { useLeaveProjectDialog } from "@app/hooks/useLeaveProjectDialog";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute, getProjectRoute } from "@app/lib/utils/router";
import type {
  LightWorkspaceType,
  SpaceUserType,
  UserType,
} from "@app/types/user";

interface ProjectHeaderActionsProps {
  isMember: boolean;
  isRestricted: boolean;
  members: SpaceUserType[];
  owner: LightWorkspaceType;
  spaceId: string;
  spaceName: string;
  user: UserType;
}

export function ProjectHeaderActions({
  isMember,
  isRestricted,
  members,
  owner,
  spaceId,
  spaceName,
  user,
}: ProjectHeaderActionsProps) {
  const router = useAppRouter();

  const handleLeaveSuccess = useCallback(() => {
    if (isRestricted) {
      void router.push(getConversationRoute(owner.sId));
    } else {
      void router.push(getProjectRoute(owner.sId, spaceId));
    }
  }, [isRestricted, owner.sId, router, spaceId]);

  const { leaveDialogProps, openLeaveDialog } = useLeaveProjectDialog({
    owner,
    spaceId,
    spaceName,
    isRestricted,
    userName: user.fullName,
    onSuccess: handleLeaveSuccess,
  });

  const canLeaveProject = isMember && members.filter((member) => member.isEditor).length > 1;

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
              nbVisibleItems={3}
              size="sm"
            />
          </div>
        )}
        {isMember && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={MoreIcon}
                variant="ghost"
                size="sm"
                tooltip="Project options"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {!canLeaveProject ? (
                <DropdownTooltipTrigger
                  description="You are the last editor of this project and cannot leave it."
                  side="left"
                >
                  <DropdownMenuItem
                    label="Leave the project"
                    icon={XMarkIcon}
                    disabled={true}
                  />
                </DropdownTooltipTrigger>
              ) : (
                <DropdownMenuItem
                  label="Leave the project"
                  icon={XMarkIcon}
                  onClick={openLeaveDialog}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <LeaveProjectDialog {...leaveDialogProps} />
    </>
  );
}
