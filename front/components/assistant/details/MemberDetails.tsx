import { ROLE_LABELS } from "@app/components/members/Roles";
import { JOB_TYPE_LABELS } from "@app/components/onboarding/ProfileOnboardingSteps";
import { UserSettingsPopover } from "@app/components/UserSettingsPopover";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ContentMessage,
  Icon,
  LoadingBlock,
  Lock01,
  MagicWand02,
  Mail01,
  Pencil01,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Users01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { ComponentType } from "react";
import { useState } from "react";

type MemberDetailsProps = {
  owner: WorkspaceType;
  user: UserType;
  onClose: () => void;
  userId: string | null;
};

function MemberDetailsRow({
  icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <Icon visual={icon} size="md" className="text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="copy-sm text-muted-foreground">{label}</span>
        <span className="copy-sm break-words text-foreground">{value}</span>
      </div>
    </div>
  );
}

function MemberDetailsHeaderSkeleton({ isSelf }: { isSelf: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <LoadingBlock className="h-20 w-20 rounded-full" />
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-7 items-center">
          <LoadingBlock className="h-5 w-32" />
        </div>
        <div className="flex h-4 items-center">
          <LoadingBlock className="h-3 w-16" />
        </div>
        <div className="flex h-5 items-center">
          <LoadingBlock className="h-3.5 w-24" />
        </div>
      </div>
      {isSelf && <LoadingBlock className="h-8 w-20 rounded-xl" />}
    </div>
  );
}

function MemberDetailsRowSkeleton() {
  return (
    <div className="flex items-center gap-4">
      <LoadingBlock className="h-6 w-6" />
      <div className="flex flex-col">
        <div className="flex h-5 items-center">
          <LoadingBlock className="h-3.5 w-16" />
        </div>
        <div className="flex h-5 items-center">
          <LoadingBlock className="h-3.5 w-40" />
        </div>
      </div>
    </div>
  );
}

export function MemberDetails({
  userId,
  onClose,
  owner,
  user,
}: MemberDetailsProps) {
  const { t } = useLingui();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { userDetails, isMembersLoading, isMembersError } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: userId ? [userId] : [],
  });
  const isSelf = userId === user.sId;

  return (
    <>
      <Sheet open={!!userId} onOpenChange={onClose}>
        <SheetContent>
          <SheetHeader>
            <VisuallyHidden>
              <SheetTitle />
            </VisuallyHidden>
            {isMembersLoading && (
              <MemberDetailsHeaderSkeleton isSelf={isSelf} />
            )}
            {userDetails && (
              <div className="flex flex-col items-center gap-4">
                <Avatar
                  name={userDetails.fullName ?? t`User avatar`}
                  visual={userDetails.image ?? undefined}
                  size="xl"
                  isRounded
                  className={
                    userDetails.revoked ? "opacity-50 grayscale" : undefined
                  }
                />
                <div className="flex flex-col items-center gap-1">
                  <h2 className="text-xl font-semibold text-foreground">
                    {userDetails.fullName}
                  </h2>
                  {userDetails.pronouns && (
                    <p className="copy-xs text-muted-foreground">
                      {userDetails.pronouns}
                    </p>
                  )}
                  {userDetails.jobType && (
                    <p className="copy-sm text-muted-foreground">
                      {t(JOB_TYPE_LABELS[userDetails.jobType])}
                    </p>
                  )}
                </div>
                {isSelf && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Pencil01}
                    label={t`Edit`}
                    onClick={() => {
                      onClose();
                      setIsSettingsOpen(true);
                    }}
                  />
                )}
              </div>
            )}
          </SheetHeader>
          <SheetContainer className="gap-6 pt-5">
            {isMembersLoading ? (
              <>
                <MemberDetailsRowSkeleton />
                <MemberDetailsRowSkeleton />
                <MemberDetailsRowSkeleton />
              </>
            ) : isMembersError ? (
              <ContentMessage title={t`Not available`} icon={Lock01} size="md">
                <Trans>This user is not available.</Trans>
              </ContentMessage>
            ) : (
              userDetails && (
                <>
                  <MemberDetailsRow
                    icon={Mail01}
                    label={t`Email`}
                    value={userDetails.email}
                  />
                  <MemberDetailsRow
                    icon={Users01}
                    label={t`Groups`}
                    value={
                      userDetails.groups.length > 0
                        ? userDetails.groups.join(", ")
                        : t`No groups`
                    }
                  />
                  <MemberDetailsRow
                    icon={MagicWand02}
                    label={t`Dust role`}
                    value={
                      userDetails.revoked
                        ? t`Former member`
                        : t(ROLE_LABELS[userDetails.role])
                    }
                  />
                </>
              )
            )}
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
            }}
          />
        </SheetContent>
      </Sheet>
      {/* Mounted regardless of `isSelf`: Edit closes the sheet, which clears `userId`. */}
      <UserSettingsPopover
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        owner={owner}
      />
    </>
  );
}
