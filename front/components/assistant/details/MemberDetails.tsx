import {
  Avatar,
  ContentMessage,
  InformationCircleIcon,
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

  const DescriptionSection = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar
          name="User avatar"
          visual={userDetails?.image ?? undefined}
          size="lg"
          isRounded
        />
        <div className="flex grow flex-col gap-1">
          <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">{`${userDetails?.fullName ?? ""}`}</div>
        </div>
      </div>
      {userDetails?.revoked && (
        <>
          <ContentMessage
            title="This user has been revoked."
            variant="warning"
            icon={InformationCircleIcon}
            size="sm"
          >
            This user is no longer active in this workspace.
            <br />
          </ContentMessage>

          <div className="flex justify-center"></div>
        </>
      )}
    </div>
  );

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
              {/* eslint-disable-next-line react-hooks/static-components */}
              <DescriptionSection />
            </SheetHeader>
            <SheetContainer className="pb-4">
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
