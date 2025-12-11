import {
  Avatar,
  Chip,
  ContentMessage,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { UserInfoTab } from "@app/components/assistant/details/tabs/UserInfoTab";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { WorkspaceType } from "@app/types";

type MemberDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  userId: string | null;
};

export function MemberDetails({ userId, onClose, owner }: MemberDetailsProps) {
  const { userDetails, isUserDetailsLoading, isUserDetailsError } =
    useMemberDetails({
      workspaceId: owner.sId,
      userId: userId,
    });

  return (
    <Sheet open={!!userId} onOpenChange={onClose}>
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {isUserDetailsLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
              <SheetTitle>Profile</SheetTitle>
            </SheetHeader>
            <SheetContainer className="pb-4">
              <div className="flex w-full items-center">
                {userDetails && (
                  <div className="flex w-full flex-col items-center gap-4">
                    <div className="relative flex flex-col items-center pb-5 sm:pb-3">
                      <Avatar
                        name={userDetails.fullName ?? "User avatar"}
                        visual={userDetails.image ?? undefined}
                        size="xl"
                        isRounded
                      />
                      <Chip
                        size="mini"
                        color={userDetails.revoked ? "rose" : "success"}
                        label={userDetails.revoked ? "Revoked" : "Active"}
                        className="absolute -bottom-0 shadow-sm"
                      />
                    </div>
                    <div className="flex grow flex-col gap-1 text-center sm:text-left">
                      <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
                        {userDetails.fullName}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {isUserDetailsError ? (
                <ContentMessage title="Not Available" icon={LockIcon} size="md">
                  This user is not available.
                </ContentMessage>
              ) : (
                <UserInfoTab userDetails={userDetails} owner={owner} />
              )}
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
