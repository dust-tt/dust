import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import type { PodManagerUpdateMembersInput } from "@app/lib/api/actions/servers/pod_manager/types";
import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Avatar, Chip, cn } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

interface PodMembersUpdateValidationDetailsProps {
  input: PodManagerUpdateMembersInput;
  owner: LightWorkspaceType;
  user: UserType;
  conversationId?: string | null;
}

function formatMemberName({
  memberId,
  currentUserId,
  memberDisplayById,
  isMembersLoading,
  t,
}: {
  memberId: string;
  currentUserId: string;
  memberDisplayById: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
  t: (descriptor: MessageDescriptor) => string;
}): string {
  if (memberId === currentUserId) {
    return t(msg`You`);
  }
  const member = memberDisplayById[memberId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return t(msg`Loading…`);
  }
  return memberId;
}

interface MemberChangeRowProps {
  memberId: string;
  action: "add" | "remove";
  role?: "member" | "editor";
  currentUserId: string;
  memberDisplayById: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}

function MemberChangeRow({
  memberId,
  action,
  role,
  currentUserId,
  memberDisplayById,
  isMembersLoading,
}: MemberChangeRowProps) {
  const { t } = useLingui();
  const member = memberDisplayById[memberId];
  const displayName = formatMemberName({
    memberId,
    currentUserId,
    memberDisplayById,
    isMembersLoading,
    t,
  });

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Avatar
        size="xs"
        visual={member?.image ?? null}
        name={member?.fullName ?? displayName}
        isRounded
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {displayName}
        </div>
        {member?.email && displayName !== member.email && (
          <div className="truncate text-xs text-muted-foreground">
            {member.email}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {action === "add" && role && (
          <Chip
            size="xs"
            color={role === "editor" ? "highlight" : "primary"}
            label={role === "editor" ? t`Editor` : t`Member`}
          />
        )}
        <Chip
          size="xs"
          color={action === "add" ? "success" : "warning"}
          label={action === "add" ? t`Will add` : t`Will remove`}
        />
      </div>
    </div>
  );
}

export function PodMembersUpdateValidationDetails({
  input,
  owner,
  user,
  conversationId,
}: PodMembersUpdateValidationDetailsProps) {
  const { t } = useLingui();
  const membersToAdd = input.membersToAdd ?? {};
  const membersToRemove = input.membersToRemove ?? [];
  const addEntries = Object.entries(membersToAdd);
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const memberIds = useMemo(
    () => [
      ...new Set([...addEntries.map(([userId]) => userId), ...membersToRemove]),
    ],
    // oxlint-disable-next-line react/exhaustive-deps -- not reported by the previous linter; deps kept as-is
    [addEntries, membersToRemove]
  );
  const { membersById, isMembersLoading } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: memberIds,
  });

  const addCount = addEntries.length;
  const removeCount = membersToRemove.length;
  const podName = isPodLabelLoading ? t`Loading…` : podLabel;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground">
        {addCount > 0 && removeCount > 0 && (
          <Trans>
            The agent wants to add{" "}
            <Plural value={addCount} one="# user" other="# users" /> and remove{" "}
            <Plural value={removeCount} one="# user" other="# users" /> in{" "}
            <span className="font-medium text-foreground">{podName}</span>.
          </Trans>
        )}
        {addCount > 0 && removeCount === 0 && (
          <Trans>
            The agent wants to add{" "}
            <Plural value={addCount} one="# user" other="# users" /> in{" "}
            <span className="font-medium text-foreground">{podName}</span>.
          </Trans>
        )}
        {addCount === 0 && removeCount > 0 && (
          <Trans>
            The agent wants to remove{" "}
            <Plural value={removeCount} one="# user" other="# users" /> in{" "}
            <span className="font-medium text-foreground">{podName}</span>.
          </Trans>
        )}
        {addCount === 0 && removeCount === 0 && (
          <Trans>
            The agent wants to update members in{" "}
            <span className="font-medium text-foreground">{podName}</span>.
          </Trans>
        )}
      </p>

      {addEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            <Trans>Users to add</Trans>
          </div>
          <div
            className={cn(
              "divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background"
            )}
          >
            {addEntries.map(([memberId, role]) => (
              <MemberChangeRow
                key={`add-${memberId}`}
                memberId={memberId}
                action="add"
                role={role}
                currentUserId={user.sId}
                memberDisplayById={membersById}
                isMembersLoading={isMembersLoading}
              />
            ))}
          </div>
        </div>
      )}

      {membersToRemove.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            <Trans>Users to remove</Trans>
          </div>
          <div
            className={cn(
              "divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background"
            )}
          >
            {membersToRemove.map((memberId) => (
              <MemberChangeRow
                key={`remove-${memberId}`}
                memberId={memberId}
                action="remove"
                currentUserId={user.sId}
                memberDisplayById={membersById}
                isMembersLoading={isMembersLoading}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
