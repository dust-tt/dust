import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { Avatar, DialogHeader, DialogTitle } from "@dust-tt/sparkle";

const MAX_HEADER_AVATARS = 3;

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
      avatars={selectedMembers.slice(0, MAX_HEADER_AVATARS).map((member) => ({
        name: member.name,
        visual: member.image ?? undefined,
        isRounded: true,
      }))}
      nbVisibleItems={MAX_HEADER_AVATARS}
      size={size}
    />
  );
}

interface BulkMembersModalHeaderProps {
  // Selected members visible on the current page, for the avatar row.
  selectedMembers: MemberUsageType[];
  memberCount: number;
  title: string;
  subtitle: string;
}

export function BulkMembersModalHeader({
  selectedMembers,
  memberCount,
  title,
  subtitle,
}: BulkMembersModalHeaderProps) {
  return (
    <DialogHeader>
      <div className="flex flex-col gap-2">
        {selectedMembers.length > 0 && (
          <div className="flex flex-row items-center gap-2">
            <SelectedMembersAvatarStack
              selectedMembers={selectedMembers}
              size="md"
            />
            {memberCount > MAX_HEADER_AVATARS && (
              <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-highlight-100 px-2 text-sm font-medium text-highlight-600">
                {memberCount}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </DialogHeader>
  );
}
