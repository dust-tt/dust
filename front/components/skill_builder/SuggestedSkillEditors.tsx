import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { SkillEditorsSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Avatar, Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface SuggestedEditorRowProps {
  userId: string;
  action: "add" | "remove";
  member: MemberDisplayInfo | undefined;
  isMembersLoading: boolean;
}

function SuggestedEditorRow({
  userId,
  action,
  member,
  isMembersLoading,
}: SuggestedEditorRowProps) {
  const displayName =
    member?.fullName ?? (isMembersLoading ? "Loading…" : userId);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Avatar
        size="xs"
        visual={member?.image ?? null}
        name={displayName}
        isRounded
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {displayName}
        </div>
        {member?.email && (
          <div className="truncate text-xs text-muted-foreground">
            {member.email}
          </div>
        )}
      </div>
      <Chip
        size="xs"
        color={action === "add" ? "success" : "warning"}
        label={action === "add" ? "Will add" : "Will remove"}
      />
    </div>
  );
}

interface SuggestedSkillEditorsProps {
  suggestion: SkillEditorsSuggestionType;
  workspaceId: string;
}

export function SuggestedSkillEditors({
  suggestion,
  workspaceId,
}: SuggestedSkillEditorsProps) {
  const { addUserIds, removeUserIds } = suggestion;

  const userIds = useMemo(
    () => [...addUserIds, ...removeUserIds],
    [addUserIds, removeUserIds]
  );
  const { membersById, isMembersLoading } = useMemberDetails({
    workspaceId,
    userIds,
  });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">
        Editors change
      </span>
      <div className="divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background">
        {addUserIds.map((userId) => (
          <SuggestedEditorRow
            key={`add-${userId}`}
            userId={userId}
            action="add"
            member={membersById[userId]}
            isMembersLoading={isMembersLoading}
          />
        ))}
        {removeUserIds.map((userId) => (
          <SuggestedEditorRow
            key={`remove-${userId}`}
            userId={userId}
            action="remove"
            member={membersById[userId]}
            isMembersLoading={isMembersLoading}
          />
        ))}
      </div>
    </div>
  );
}
