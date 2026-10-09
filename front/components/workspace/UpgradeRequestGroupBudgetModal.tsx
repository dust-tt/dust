import type { EditGroupUsageGroup } from "@app/components/workspace/EditGroupUsageDialog";
import { EditGroupUsageDialog } from "@app/components/workspace/EditGroupUsageDialog";
import { useGroupsUsage } from "@app/hooks/useGroupsUsage";
import { useMembersUsage } from "@app/lib/swr/memberships";
import type { GroupType } from "@app/types/groups";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

interface UpgradeRequestGroupBudgetModalProps {
  owner: WorkspaceType;
  request: MembershipUpgradeRequestType;
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  onClose: () => void;
  onSaved: () => void;
}

function resolveSharedBudgetGroup({
  groups,
  editableGroupIds,
  memberGroupNames,
  usageByGroupId,
}: {
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  memberGroupNames: ReadonlySet<string>;
  usageByGroupId: Map<
    string,
    { groupId: string; limitAwuCredits: number; usedAwuCredits: number }
  >;
}): EditGroupUsageGroup | null {
  const candidates = groups
    .filter(
      (group) =>
        memberGroupNames.has(group.name) &&
        usageByGroupId.has(group.sId) &&
        (!editableGroupIds || editableGroupIds.has(group.sId))
    )
    .map((group) => {
      const sharedUsageLimitUsage = usageByGroupId.get(group.sId);
      return {
        groupId: group.sId,
        name: group.name,
        memberCount: group.memberCount,
        poolCapAwuCredits: group.poolCapAwuCredits,
        grantedSeatType: group.grantedSeatType,
        sharedUsageLimitUsage,
      } satisfies EditGroupUsageGroup;
    });

  if (candidates.length === 0) {
    return null;
  }

  // Prefer the group whose shared budget is exhausted — that is usually why
  // the member opened the request. Fall back to the only / first candidate.
  const atLimit = candidates.find((group) => {
    const usage = group.sharedUsageLimitUsage;
    return usage !== undefined && usage.usedAwuCredits >= usage.limitAwuCredits;
  });
  return atLimit ?? candidates[0] ?? null;
}

/**
 * @cc [owner:philipperolet,label:product] request-group-budget-resolve
 * The editor MUST resolve the requester's shared-budget group before enabling
 * edits. `onSaved` MUST run only after a group-budget save succeeds.
 */
export function UpgradeRequestGroupBudgetModal({
  owner,
  request,
  groups,
  editableGroupIds,
  onClose,
  onSaved,
}: UpgradeRequestGroupBudgetModalProps) {
  const { t } = useLingui();
  const { membersUsage, isMembersUsageLoading, isMembersUsageError } =
    useMembersUsage({
      workspaceId: owner.sId,
      searchTerm: request.requester.email ?? request.requester.name,
      pageIndex: 0,
      pageSize: 25,
    });
  const { usageByGroupId, isGroupsUsageLoading, isGroupsUsageError } =
    useGroupsUsage({ owner });

  const member = membersUsage.find(
    (entry) => entry.sId === request.requester.sId
  );
  const isLoading = isMembersUsageLoading || isGroupsUsageLoading;
  const isError = isMembersUsageError || isGroupsUsageError || !member;

  const group = useMemo(() => {
    if (!member || isGroupsUsageError) {
      return null;
    }
    return resolveSharedBudgetGroup({
      groups,
      editableGroupIds,
      memberGroupNames: new Set(member.groups),
      usageByGroupId,
    });
  }, [member, groups, editableGroupIds, usageByGroupId, isGroupsUsageError]);

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Edit group budget</Trans>
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !group) {
    const requesterName = request.requester.name;
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Edit group budget</Trans>
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {t`Could not load the shared group budget for ${requesterName}. Refresh the page to try again.`}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EditGroupUsageDialog
      isOpen
      onClose={onClose}
      owner={owner}
      group={group}
      sharedUsageLimitAccess="editable"
      onSaved={onSaved}
    />
  );
}
