import { CreatePodModal } from "@app/components/assistant/conversation/CreatePodModal";
import { AgentMemoryCards } from "@app/components/user_profile/AgentMemoryCards";
import { WORKSPACE_ROLE_LABELS } from "@app/components/user_profile/roleLabels";
import { useAppRouter } from "@app/lib/platform";
import { useMemberDetails } from "@app/lib/swr/assistants";
import { useMyAgentMemories, useUserProfile } from "@app/lib/swr/user_profile";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { OpenUserSettingsEvent } from "@app/lib/user_settings_events";
import { getPodRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  Chip,
  ContentMessage,
  Icon,
  Lock01,
  MagicWand02,
  Mail01,
  Pencil01,
  Plus,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Users01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useCallback, useState } from "react";

interface UserProfileSheetProps {
  owner: LightWorkspaceType;
  currentUserId: string;
  userId: string | null;
  onClose: () => void;
}

function trackProfileEvent(object: string, extra?: Record<string, string>) {
  trackEvent({
    area: TRACKING_AREAS.WORKSPACE,
    object,
    action: TRACKING_ACTIONS.CLICK,
    extra,
  });
}

/**
 * Side panel showing a workspace member's profile. Opened from any user touchpoint through the
 * `userDetails` query param. The current user sees an "Edit" button opening their personal
 * settings, and the memories agents hold about them, which are never shown to collaborators.
 */
export function UserProfileSheet({
  owner,
  currentUserId,
  userId,
  onClose,
}: UserProfileSheetProps) {
  const { t } = useLingui();
  const router = useAppRouter();
  const [isCreatePodModalOpen, setIsCreatePodModalOpen] = useState(false);

  const isMe = !!userId && userId === currentUserId;

  const { userDetails, isMembersLoading, isMembersError } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: userId ? [userId] : [],
  });
  const { profile } = useUserProfile({ owner, userId });
  const { agentMemories, isAgentMemoriesLoading } = useMyAgentMemories({
    owner,
    disabled: !isMe,
  });

  const handleEdit = useCallback(() => {
    trackProfileEvent("user_profile_edit");
    onClose();
    window.dispatchEvent(new OpenUserSettingsEvent("personal"));
  }, [onClose]);

  const handleOpenAgent = useCallback(
    (agentId: string) => {
      trackProfileEvent("user_profile_agent_memory", { agentId });
      const { userDetails: _, ...restQuery } = router.query;
      void router.push(
        {
          pathname: router.pathname,
          query: { ...restQuery, agentDetails: agentId },
        },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const groupNames = profile?.groups.map((g) => g.name).join(", ");

  return (
    <>
      <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="md">
          {isMembersLoading ? (
            <div className="flex h-full w-full items-center justify-center">
              <SheetTitle className="sr-only">
                <Trans>Profile</Trans>
              </SheetTitle>
              <Spinner size="lg" />
            </div>
          ) : isMembersError || !userDetails ? (
            <>
              <SheetHeader>
                <SheetTitle className="sr-only">
                  <Trans>Profile</Trans>
                </SheetTitle>
              </SheetHeader>
              <ContentMessage title={t`Not available`} icon={Lock01} size="md">
                <Trans>This user is not available.</Trans>
              </ContentMessage>
            </>
          ) : (
            <>
              <SheetHeader className="items-center gap-4 pt-9">
                <div className="relative flex flex-col items-center">
                  <Avatar
                    name={userDetails.fullName}
                    visual={userDetails.image ?? undefined}
                    size="xl"
                    isRounded
                    className={
                      userDetails.revoked ? "opacity-50 grayscale" : undefined
                    }
                  />
                  {userDetails.revoked && (
                    <Chip
                      size="xs"
                      color="primary"
                      label={t(WORKSPACE_ROLE_LABELS.none)}
                      className="absolute -bottom-3 shadow-sm"
                    />
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="flex flex-col items-center">
                    <SheetTitle className="heading-xl text-foreground">
                      {userDetails.fullName}
                    </SheetTitle>
                    {profile?.pronouns && (
                      <span className="copy-xs text-muted-foreground">
                        {profile.pronouns}
                      </span>
                    )}
                  </div>
                  {profile?.jobTitle && (
                    <span className="copy-sm text-muted-foreground">
                      {profile.jobTitle}
                    </span>
                  )}
                </div>
                <div className="flex justify-center gap-2">
                  {isMe ? (
                    <Button
                      label={t`Edit`}
                      icon={Pencil01}
                      variant="outline"
                      size="sm"
                      onClick={handleEdit}
                    />
                  ) : (
                    !userDetails.revoked && (
                      <Button
                        label={t`Create Pod`}
                        icon={Plus}
                        variant="highlight"
                        size="sm"
                        onClick={() => {
                          trackProfileEvent("user_profile_create_pod");
                          setIsCreatePodModalOpen(true);
                        }}
                      />
                    )
                  )}
                </div>
              </SheetHeader>
              <SheetContainer className="gap-4 px-0">
                <Separator />
                <div className="flex flex-col gap-6 px-7">
                  <ProfileInfoRow
                    icon={Mail01}
                    label={t`Email`}
                    value={userDetails.email}
                  />
                  {groupNames && (
                    <ProfileInfoRow
                      icon={Users01}
                      label={t`Groups`}
                      value={groupNames}
                    />
                  )}
                  {!userDetails.revoked && (
                    <ProfileInfoRow
                      icon={MagicWand02}
                      label={t`Dust role`}
                      value={t(WORKSPACE_ROLE_LABELS[userDetails.role])}
                    />
                  )}
                </div>
                {isMe && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-6 px-7 pb-6">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="heading-sm">
                          <Trans>Memory</Trans>
                        </span>
                        <span className="copy-xs">
                          <Trans>Not visible to collaborators</Trans>
                        </span>
                      </div>
                      <AgentMemoryCards
                        agentMemories={agentMemories}
                        isLoading={isAgentMemoriesLoading}
                        onAgentClick={handleOpenAgent}
                      />
                    </div>
                  </>
                )}
              </SheetContainer>
            </>
          )}
        </SheetContent>
      </Sheet>
      {userId && !isMe && (
        <CreatePodModal
          isOpen={isCreatePodModalOpen}
          onClose={() => setIsCreatePodModalOpen(false)}
          onCreated={(pod) => {
            onClose();
            void router.push(getPodRoute(owner.sId, pod.sId));
          }}
          owner={owner}
          initialMemberIds={[userId]}
        />
      )}
    </>
  );
}

function ProfileInfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <Icon visual={icon} size="md" className="text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="heading-sm text-muted-foreground">{label}</span>
        <span className="copy-sm truncate text-foreground">{value}</span>
      </div>
    </div>
  );
}
