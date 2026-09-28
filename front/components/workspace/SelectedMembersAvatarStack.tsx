import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { Avatar } from "@dust-tt/sparkle";

const MAX_VISIBLE_AVATARS = 3;

interface SelectedMembersAvatarStackProps {
  selectedMembers: MemberUsageType[];
  size: "xs" | "md";
}

export function SelectedMembersAvatarStack({
  selectedMembers,
  size,
}: SelectedMembersAvatarStackProps) {
  return (
    <Avatar.Stack
      avatars={selectedMembers.map((member) => ({
        name: member.name,
        visual: member.image ?? undefined,
        isRounded: true,
      }))}
      nbVisibleItems={MAX_VISIBLE_AVATARS}
      size={size}
    />
  );
}
