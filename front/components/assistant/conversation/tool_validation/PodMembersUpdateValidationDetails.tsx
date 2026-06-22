import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import type { PodManagerUpdateMembersInput } from "@app/lib/api/actions/servers/pod_manager/types";
import {
  type MemberDisplayInfo,
  useMemberDetails,
} from "@app/lib/swr/assistants";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Avatar, Chip, cn } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface PodMembersUpdateValidationDetailsProps {
  input: PodManagerUpdateMembersInput;
  owner: LightWorkspaceType;
  user: UserType;
  conversationId?: string | null;
}

function formatMemberName({
  memberSId,
  currentUserSId,
  memberDisplayBySId,
  isMembersLoading,
}: {
  memberSId: string;
  currentUserSId: string;
  memberDisplayBySId: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}): string {
  if (memberSId === currentUserSId) {
    return "You";
  }
  const member = memberDisplayBySId[memberSId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return "Loading…";
  }
  return memberSId;
}

interface MemberChangeRowProps {
  memberSId: string;
  action: "add" | "remove";
  role?: "member" | "editor";
  currentUserSId: string;
  memberDisplayBySId: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}

function MemberChangeRow({
  memberSId,
  action,
  role,
  currentUserSId,
  memberDisplayBySId,
  isMembersLoading,
}: MemberChangeRowProps) {
  const member = memberDisplayBySId[memberSId];
  const displayName = formatMemberName({
    memberSId,
    currentUserSId,
    memberDisplayBySId,
    isMembersLoading,
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
        <div className="truncate text-sm font-medium text-foreground dark:text-foreground-night">
          {displayName}
        </div>
        {member?.email && displayName !== member.email && (
          <div className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
            {member.email}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {action === "add" && role && (
          <Chip
            size="xs"
            color={role === "editor" ? "blue" : "primary"}
            label={role === "editor" ? "Editor" : "Member"}
          />
        )}
        <Chip
          size="xs"
          color={action === "add" ? "green" : "rose"}
          label={action === "add" ? "Will add" : "Will remove"}
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
  const membersToAdd = input.membersToAdd ?? {};
  const membersToRemove = input.membersToRemove ?? [];
  const addEntries = Object.entries(membersToAdd);
  const { podLabel, isPodLabelLoading } = usePodLabel({
    owner,
    dustPodUri: input.dustPod?.uri,
    conversationId,
  });

  const memberSIds = useMemo(
    () => [
      ...new Set([...addEntries.map(([userId]) => userId), ...membersToRemove]),
    ],
    [addEntries, membersToRemove]
  );
  const { membersBySId, isMembersLoading } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: memberSIds,
  });

  const summaryParts: string[] = [];
  if (addEntries.length > 0) {
    summaryParts.push(
      `add ${addEntries.length} user${addEntries.length === 1 ? "" : "s"}`
    );
  }
  if (membersToRemove.length > 0) {
    summaryParts.push(
      `remove ${membersToRemove.length} user${membersToRemove.length === 1 ? "" : "s"}`
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        The agent wants to {summaryParts.join(" and ")} in{" "}
        <span className="font-medium text-foreground dark:text-foreground-night">
          {isPodLabelLoading ? "Loading…" : podLabel}
        </span>
        .
      </p>

      {addEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
            Users to add
          </div>
          <div
            className={cn(
              "divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background dark:divide-separator-night dark:border-separator-night dark:bg-background-night"
            )}
          >
            {addEntries.map(([memberSId, role]) => (
              <MemberChangeRow
                key={`add-${memberSId}`}
                memberSId={memberSId}
                action="add"
                role={role}
                currentUserSId={user.sId}
                memberDisplayBySId={membersBySId}
                isMembersLoading={isMembersLoading}
              />
            ))}
          </div>
        </div>
      )}

      {membersToRemove.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
            Users to remove
          </div>
          <div
            className={cn(
              "divide-y divide-separator overflow-hidden rounded-xl border border-separator bg-background dark:divide-separator-night dark:border-separator-night dark:bg-background-night"
            )}
          >
            {membersToRemove.map((memberSId) => (
              <MemberChangeRow
                key={`remove-${memberSId}`}
                memberSId={memberSId}
                action="remove"
                currentUserSId={user.sId}
                memberDisplayBySId={membersBySId}
                isMembersLoading={isMembersLoading}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
