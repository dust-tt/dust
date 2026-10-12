import type { DocumentLiveParticipant } from "@app/components/editor/document";
import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

interface LiveParticipantsAvatarsProps {
  owner: LightWorkspaceType;
  participants: DocumentLiveParticipant[];
}

/**
 * @cc [owner:tdraier,label:react] live-participants-avatars
 * Every participant MUST show, none folded into a counter, with their workspace profile picture
 * and name, or with the name the session gave and their initials when the member cannot be
 * resolved. Each member MUST be looked up once while the avatars are shown: a later join or leave
 * MUST NOT look up again a member already resolved or failed. While a member's lookup is pending,
 * their avatar MUST show as busy.
 */
export const LiveParticipantsAvatars = ({
  owner,
  participants,
}: LiveParticipantsAvatarsProps) => {
  // A member's details, or null once their lookup failed.
  const [lookedUp, setLookedUp] = useState<
    Record<string, MemberDisplayInfo | null>
  >({});
  const pendingIds = useMemo(
    () => participants.map(({ id }) => id).filter((id) => !(id in lookedUp)),
    [participants, lookedUp]
  );
  const { membersById, isMembersLoading, isMembersValidating } =
    useMemberDetails({
      workspaceId: owner.sId,
      userIds: pendingIds,
      shouldRetryOnError: false,
    });

  // Once the lookup settled, a member it did not return failed.
  useEffect(() => {
    if (pendingIds.length === 0 || isMembersLoading || isMembersValidating) {
      return;
    }
    setLookedUp((current) => {
      const next = { ...current };
      for (const id of pendingIds) {
        next[id] = membersById[id] ?? null;
      }
      return next;
    });
  }, [pendingIds, membersById, isMembersLoading, isMembersValidating]);

  return (
    <Avatar.Stack
      size="xs"
      nbVisibleItems={participants.length}
      avatars={participants.map(({ id, name }) => {
        const member = lookedUp[id] ?? membersById[id];
        return {
          name: member?.fullName ?? name,
          visual: member?.image ?? undefined,
          busy: !(id in lookedUp) && membersById[id] === undefined,
          isRounded: true,
        };
      })}
    />
  );
};
