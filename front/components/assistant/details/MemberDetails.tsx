import {
  Avatar,
  Chip,
  ContentMessage,
  LockIcon,
  Separator,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { RoleType, WorkspaceType } from "@app/types";

type MemberDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  userId: string | null;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) {
    return null;
  }
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const getRoleBadgeColor = (
  role: RoleType
): "golden" | "rose" | "green" | "primary" => {
  if (role === "none") {
    return "primary";
  }
  return ROLES_DATA[role].color;
};

export function MemberDetails({ userId, onClose, owner }: MemberDetailsProps) {
  const { userDetails, isUserDetailsLoading, isUserDetailsError } =
    useMemberDetails({
      workspaceId: owner.sId,
      userId: userId,
    });

  return (
    <Sheet open={!!userId} onOpenChange={onClose}>
      <SheetContent>
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {isUserDetailsLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : isUserDetailsError ? (
          <ContentMessage title="Not Available" icon={LockIcon} size="md">
            This user is not available.
          </ContentMessage>
        ) : (
          userDetails && (
            <div className="flex h-full w-full flex-col items-center pt-8">
              <div className="flex w-full max-w-sm flex-col items-center gap-6">
                {/* Avatar with role badge */}

                <div className="relative flex flex-col items-center gap-3">
                  <Avatar
                    name={userDetails.fullName ?? "User avatar"}
                    visual={userDetails.image ?? undefined}
                    size="xl"
                    isRounded
                    className={
                      userDetails.revoked ? "opacity-50 grayscale" : undefined
                    }
                  />
                  <Chip
                    size="xs"
                    color={
                      userDetails.revoked
                        ? "primary"
                        : getRoleBadgeColor(userDetails.role)
                    }
                    label={
                      userDetails.revoked
                        ? "Former member"
                        : displayRole(userDetails.role)
                    }
                    className="absolute -bottom-3 shadow-sm"
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
                    {userDetails.fullName}
                  </h2>
                  {(userDetails.startAt ?? userDetails.endAt) && (
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {userDetails.revoked && userDetails.endAt
                        ? `Left the workspace: ${formatDate(userDetails.endAt)}`
                        : userDetails.startAt
                          ? `Joined the workspace: ${formatDate(userDetails.startAt)}`
                          : null}
                    </p>
                  )}
                </div>

                <Separator />
                <div className="grid w-full grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                      Username
                    </div>
                    <div className="mt-1 text-sm text-foreground dark:text-foreground-night">
                      {userDetails.username}
                    </div>
                  </div>
                  <div className="col-span-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                      Full name
                    </div>
                    <div className="mt-1 text-sm text-foreground dark:text-foreground-night">
                      {userDetails.fullName}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
                      Email
                    </div>
                    <div className="mt-1 text-sm text-foreground dark:text-foreground-night">
                      {userDetails.email}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
        <SheetFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
