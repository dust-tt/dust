import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { Avatar, DialogHeader, DialogTitle } from "@dust-tt/sparkle";

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

interface BulkMembersModalHeaderProps {
  // Selected members, for the avatar row.
  selectedMembers: MemberUsageType[];
  title: string;
  subtitle: string;
}

export function BulkMembersModalHeader({
  selectedMembers,
  title,
  subtitle,
}: BulkMembersModalHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex flex-col gap-2">
        {selectedMembers.length > 0 && (
          <SelectedMembersAvatarStack
            selectedMembers={selectedMembers}
            size="md"
          />
        )}
        <div className="flex flex-col gap-1">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </DialogHeader>
  );
}
