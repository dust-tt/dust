import type { SuggestedChangeAction } from "@app/components/shared/SuggestedChangeRow";
import { SuggestedChangeRow } from "@app/components/shared/SuggestedChangeRow";
import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
import { Avatar } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

interface SuggestedEditorRowProps {
  userId: string;
  action: SuggestedChangeAction;
  member: MemberDisplayInfo | undefined;
  isMembersLoading: boolean;
}

function SuggestedEditorRow({
  userId,
  action,
  member,
  isMembersLoading,
}: SuggestedEditorRowProps) {
  const { t } = useLingui();
  const displayName =
    member?.fullName ?? (isMembersLoading ? t`Loading…` : userId);

  return (
    <SuggestedChangeRow
      action={action}
      visual={
        <Avatar
          size="xs"
          visual={member?.image ?? null}
          name={displayName}
          isRounded
        />
      }
      title={displayName}
      description={member?.email ?? undefined}
    />
  );
}

interface SuggestedEditorsProps {
  suggestion: { addUserIds: string[]; removeUserIds: string[] };
  workspaceId: string;
}

export function SuggestedEditors({
  suggestion,
  workspaceId,
}: SuggestedEditorsProps) {
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
      <span className="text-sm text-muted-foreground">
        <Trans>Editors</Trans>
      </span>
      <div className="divide-y divide-border">
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
