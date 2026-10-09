import type { DocumentLiveParticipant } from "@app/components/editor/document";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar } from "@dust-tt/sparkle";

interface LiveParticipantsAvatarsProps {
  owner: LightWorkspaceType;
  participants: DocumentLiveParticipant[];
}

/**
 * @cc [owner:tdraier,label:react] live-participants-avatars
 * Each participant MUST show with their workspace profile picture and name, or with the name the
 * session gave and their initials when the member cannot be resolved. A failed member lookup MUST
 * NOT be retried.
 */
export const LiveParticipantsAvatars = ({
  owner,
  participants,
}: LiveParticipantsAvatarsProps) => {
  const { membersById } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: participants.map(({ id }) => id),
    shouldRetryOnError: false,
  });

  return (
    <Avatar.Stack
      size="xs"
      avatars={participants.map(({ id, name }) => ({
        name: membersById[id]?.fullName ?? name,
        visual: membersById[id]?.image ?? undefined,
        isRounded: true,
      }))}
    />
  );
};
