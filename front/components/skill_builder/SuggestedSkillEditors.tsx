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
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <Avatar
        size="xs"
        visual={member?.image ?? null}
        name={displayName}
        isRounded
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{displayName}</div>
        {member?.email && (
          <div className="truncate text-xs text-muted-foreground">
            {member.email}
          </div>
        )}
      </div>
      <Chip
        size="xs"
        color={action === "add" ? "highlight" : "warning"}
        label={action === "add" ? "Add" : "Remove"}
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
      <span className="text-sm text-muted-foreground">Editors</span>
      <div>
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
