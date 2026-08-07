import {
  getGroupKindChip,
  PROVISIONED_GROUP_TOOLTIP,
} from "@app/components/groups/GroupKinds";
import {
  useAddMemberToGroup,
  useGroups,
  useMemberGroups,
  useRemoveMemberFromGroup,
} from "@app/lib/swr/groups";
import type { GroupType } from "@app/types/groups";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Plus,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

// Only manually-managed groups can be assigned from Dust: provisioned group membership is owned
// by the identity provider.
const ADDABLE_GROUP_KINDS = ["regular_manual"] as const;

interface MemberGroupsSectionProps {
  owner: LightWorkspaceType;
  userId: string;
  disabled?: boolean;
}

export function MemberGroupsSection({
  owner,
  userId,
  disabled,
}: MemberGroupsSectionProps) {
  const [groupSearch, setGroupSearch] = useState("");
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);

  const { memberGroups, isMemberGroupsLoading } = useMemberGroups({
    owner,
    userId,
    disabled,
  });
  const { groups: addableGroups } = useGroups({
    owner,
    kinds: ADDABLE_GROUP_KINDS,
    disabled,
  });

  const { doAddMemberToGroup } = useAddMemberToGroup({ owner, userId });
  const { doRemoveMemberFromGroup } = useRemoveMemberFromGroup({
    owner,
    userId,
  });

  const selectableGroups = useMemo(() => {
    const memberGroupIds = new Set(memberGroups.map((g) => g.sId));
    return addableGroups.filter(
      (group) =>
        !memberGroupIds.has(group.sId) &&
        group.name.toLowerCase().includes(groupSearch.toLowerCase())
    );
  }, [addableGroups, memberGroups, groupSearch]);

  // While an addition is in flight the group is not in `memberGroups` yet: show it as a busy chip
  // so the change is visible immediately.
  const displayedGroups = useMemo(() => {
    const pendingAddedGroup =
      pendingGroupId && !memberGroups.some((g) => g.sId === pendingGroupId)
        ? addableGroups.find((g) => g.sId === pendingGroupId)
        : undefined;

    return pendingAddedGroup
      ? [...memberGroups, pendingAddedGroup].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      : memberGroups;
  }, [memberGroups, addableGroups, pendingGroupId]);

  const onAdd = async (group: GroupType) => {
    setPendingGroupId(group.sId);
    await doAddMemberToGroup({ groupId: group.sId, groupName: group.name });
    setPendingGroupId(null);
  };

  const onRemove = async (group: GroupType) => {
    setPendingGroupId(group.sId);
    await doRemoveMemberFromGroup({
      groupId: group.sId,
      groupName: group.name,
    });
    setPendingGroupId(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="heading-base text-foreground">Groups</div>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) {
              setGroupSearch("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              icon={Plus}
              label="Add to group"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[320px]" collisionPadding={8}>
            <DropdownMenuSearchbar
              name="group-search"
              placeholder="Search groups"
              value={groupSearch}
              onChange={setGroupSearch}
              autoFocus
            />
            {selectableGroups.map((group) => (
              <DropdownMenuItem
                key={group.sId}
                label={group.name}
                endComponent={
                  <span className="text-sm text-muted-foreground">
                    {group.memberCount} member{pluralize(group.memberCount)}
                  </span>
                }
                onClick={() => void onAdd(group)}
              />
            ))}
            {selectableGroups.length === 0 && (
              <DropdownMenuItem
                label={groupSearch ? "No groups found" : "All groups added"}
                disabled
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isMemberGroupsLoading ? (
        <div className="flex py-1">
          <Spinner size="xs" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {displayedGroups.map((group) =>
            group.kind === "provisioned" ? (
              <Tooltip
                key={group.sId}
                tooltipTriggerAsChild
                trigger={
                  // Chip does not forward DOM props, so the trigger handlers go on a wrapper.
                  <span className="inline-flex">
                    <Chip
                      size="xs"
                      color={getGroupKindChip(group.kind).color}
                      label={group.name}
                    />
                  </span>
                }
                label={PROVISIONED_GROUP_TOOLTIP}
              />
            ) : (
              <Chip
                key={group.sId}
                size="xs"
                color={getGroupKindChip(group.kind).color}
                label={group.name}
                isBusy={pendingGroupId === group.sId}
                onRemove={() => void onRemove(group)}
              />
            )
          )}
          {displayedGroups.length === 0 && (
            <div className="text-sm text-muted-foreground">
              This member is not part of any group.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
