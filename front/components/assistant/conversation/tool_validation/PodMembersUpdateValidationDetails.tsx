import { usePodLabel } from "@app/components/assistant/conversation/tool_validation/usePodLabel";
import type { PodManagerUpdateMembersInput } from "@app/lib/api/actions/servers/pod_manager/types";
import type { MemberDisplayInfo } from "@app/lib/swr/assistants";
import { useMemberDetails } from "@app/lib/swr/assistants";
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
  memberId,
  currentUserId,
  memberDisplayById,
  isMembersLoading,
}: {
  memberId: string;
  currentUserId: string;
  memberDisplayById: Record<string, MemberDisplayInfo>;
  isMembersLoading: boolean;
}): string {
  if (memberId === currentUserId) {
    return "You";
  }
  const member = memberDisplayById[memberId];
  if (member) {
    return member.fullName;
  }
  if (isMembersLoading) {
    return "Loading…";
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
  const member = memberDisplayById[memberId];
  const displayName = formatMemberName({
    memberId,
    currentUserId,
    memberDisplayById,
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
            label={role === "editor" ? "Editor" : "Member"}
          />
        )}
        <Chip
          size="xs"
          color={action === "add" ? "success" : "warning"}
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

  const memberIds = useMemo(
    () => [
      ...new Set([...addEntries.map(([userId]) => userId), ...membersToRemove]),
    ],
    [addEntries, membersToRemove]
  );
  const { membersById, isMembersLoading } = useMemberDetails({
    workspaceId: owner.sId,
    userIds: memberIds,
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
      <p className="text-sm text-muted-foreground">
        The agent wants to {summaryParts.join(" and ")} in{" "}
        <span className="font-medium text-foreground">
          {isPodLabelLoading ? "Loading…" : podLabel}
        </span>
        .
      </p>

      {addEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Users to add
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
            Users to remove
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
